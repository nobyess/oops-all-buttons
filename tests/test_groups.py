import copy
import tempfile
import unittest
from pathlib import Path
from hmi.service import Service
from hmi.store import Store
from hmi.pages import validate_page
from hmi.polling import page_tags
from hmi.page_transfer import export_page, import_page


class GroupTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.service = Service(Store(Path(self.folder.name) / 'test.sqlite3'))
        self.service.add_source({'id': 'memory', 'name': 'Memory', 'kind': 'memory'})
        self.service.add_tag({'id': 'counter', 'name': 'Counter', 'source': 'memory'})
        self.page = self.service.pages()[0]
        self.page['controls'] = [
            {'id': 'button', 'type': 'button', 'name': 'Start', 'groupId': 'group_motor', 'left': 40, 'top': 60, 'width': 100, 'height': 40},
            {'id': 'line', 'type': 'polyline', 'groupId': 'group_motor', 'left': 200, 'top': 60, 'width': 100, 'height': 40, 'points': [[0, 0], [1, 1]], 'pinned': True}]
        self.page['groups'] = [{'id': 'group_motor', 'type': 'group', 'name': 'Motor Assembly', 'visible': True,
            'events': [{'id': 'hide', 'tag': 'counter', 'operator': '>', 'operand': {'value': 0}, 'action': 'hide'}]}]

    def tearDown(self):
        for driver in self.service.drivers.values():
            driver.close()
        self.folder.cleanup()

    def test_save_reload_references_and_interest_include_group_events(self):
        self.service.save_page(self.page)
        stored = self.service.pages()[0]
        self.assertEqual(stored['controls'][0]['groupId'], 'group_motor')
        self.assertEqual(stored['groups'][0]['name'], 'Motor Assembly')
        self.assertEqual(page_tags(stored), {'counter'})
        use = self.service.usage('counter')[0]
        self.assertEqual(use['control'], 'group_motor')
        self.assertEqual(use['controlName'], 'Motor Assembly')
        self.service.live_interest('viewer', {'pages': [stored['id']]})
        self.assertIn('counter', self.service.polling.leases['viewer'][1])
        with self.assertRaises(ValueError):
            self.service.remove_tag({'id': 'counter'})
        reloaded = Service(Store(Path(self.folder.name) / 'test.sqlite3'))
        self.assertEqual(reloaded.pages()[0]['groups'][0]['events'][0]['tag'], 'counter')
        for driver in reloaded.drivers.values():
            driver.close()

    def test_import_export_remap_membership_group_events_and_parameters(self):
        self.page['parameters'] = [{'id': 'parameter:signal', 'name': 'Signal'}]
        self.page['groups'][0]['events'][0].update(tag='parameter:signal', operand={'kind': 'tag', 'tag': 'counter'})
        self.service.save_page(self.page)
        payload = export_page(self.service, {'id': self.page['id']})
        self.assertIn('counter', payload['tags'])
        imported = import_page(self.service, {'page': payload, 'name': 'Imported'})
        page = next(p for p in self.service.pages() if p['id'] == imported['id'])
        group = page['groups'][0]
        self.assertNotEqual(group['id'], 'group_motor')
        self.assertTrue(all(c['groupId'] == group['id'] for c in page['controls']))
        self.assertEqual(group['events'][0]['tag'], page['parameters'][0]['id'])
        self.assertEqual(group['events'][0]['operand']['tag'], 'counter')
        self.assertNotEqual(group['events'][0]['id'], 'hide')
        self.assertEqual(page['controls'][1]['points'], [[0, 0], [1, 1]])
        self.assertTrue(page['controls'][1]['pinned'])
        self.assertEqual(self.service.pages()[0]['controls'][0]['id'], 'button')

    def test_invalid_groups_rejected_without_saving(self):
        for change in [
            lambda p: p['groups'].append(copy.deepcopy(p['groups'][0])),
            lambda p: p['controls'][0].update(groupId='missing'),
            lambda p: p['groups'][0].update(groupId='nested'),
            lambda p: p['groups'][0]['events'][0].update(action='set_colors'),
            lambda p: p['groups'][0].update(id='button'),
            lambda p: p['groups'][0].update(actions=[{'action': 'set'}])]:
            page = copy.deepcopy(self.page)
            change(page)
            with self.assertRaises(ValueError):
                self.service.save_page(page)
        self.assertEqual(self.service.pages()[0]['groups'], [])

    def test_old_pages_default_to_no_groups(self):
        page = {'id': 'old', 'controls': []}
        validate_page(page)
        self.assertEqual(page['groups'], [])
