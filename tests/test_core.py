import tempfile
import threading
import unittest
from pathlib import Path
from hmi.service import Service
from hmi.store import Store


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.service = Service(Store(Path(self.temp.name) / 'test.sqlite3'))
        self.service.add_source({'id':'sim', 'kind':'memory'})
        self.service.add_tag({'id':'counter', 'source':'sim', 'address':'counter'})

    def tearDown(self):
        self.temp.cleanup()

    def act(self, action, value=1):
        return self.service.act({'tag':'counter', 'action':action, 'value':value})

    def test_memory_auto_identity_and_rename(self):
        self.service.add_tag({'name': 'First', 'source': 'sim'})
        self.service.add_tag({'name': 'Second', 'source': 'sim'})
        first, second = self.service.tags()[-2:]
        self.assertNotEqual(first['id'], second['id'])
        self.assertEqual(first['address'], first['id'])
        self.service.act({'tag': first['id'], 'action': 'set', 'value': 42})
        self.service.edit_tag({'id': first['id'], 'name': 'Renamed', 'address': 'ignored'})
        self.assertEqual(self.service.values()[first['id']]['value'], 42)
        self.assertEqual(self.service.values()[second['id']]['value'], 0)
        self.assertEqual(self.service.tags()[-2]['address'], first['id'])

    def test_legacy_memory_address_is_preserved(self):
        tags = self.service.tags()
        tags[0]['address'] = 'legacy-object'
        self.service.store.set('tags', tags)
        self.service.drivers['sim'].write('legacy-object', 7)
        self.service.edit_tag({'id': 'counter', 'name': 'Renamed'})
        self.assertEqual(self.service.tags()[0]['address'], 'legacy-object')
        self.assertEqual(self.service.values()['counter']['value'], 7)

    def test_actions(self):
        self.assertEqual(self.act('set',10),10)
        self.assertEqual(self.act('increment',2),12)
        self.assertEqual(self.act('decrement',3),9)
        self.assertEqual(self.act('toggle'),0)
        self.assertEqual(self.act('toggle'),1)
        self.assertEqual(self.act('set', 0),0)

    def test_concurrent_increments(self):
        threads = [threading.Thread(target=lambda: [self.act('increment') for _ in range(10)]) for _ in range(5)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual(self.service.values()['counter']['value'],50)

    def test_read_only_and_invalid_values(self):
        self.service.add_tag({'id':'readonly','source':'sim','address':'r','writable':False})
        self.service.act({'tag':'readonly','action':'set','value':5})
        self.assertEqual(self.service.values()['readonly']['value'],5)
        with self.assertRaises(ValueError): self.act('set',float('nan'))

    def test_configuration_persists(self):
        reloaded = Service(Store(self.service.store.path))
        self.assertEqual(reloaded.tags()[0]['id'],'counter')
        with self.assertRaises(ValueError):
            reloaded.add_source({'id':'sim','kind':'memory'})

    def test_multiple_pages_and_usage_protection(self):
        page = self.service.add_page({'name': 'Plant room'})
        page['controls'] = [{'id': 'display', 'tag': 'counter'}]
        self.service.save_page(page)
        self.assertEqual(len(self.service.pages()), 2)
        usage = self.service.tag_catalog()[0]['usage']
        self.assertEqual(usage[0]['page'], page['id'])
        with self.assertRaises(ValueError):
            self.service.remove_tag({'id': 'counter'})
        with self.assertRaises(ValueError):
            self.service.remove_source({'id': 'sim'})
        self.service.remove_page({'id': page['id']})
        self.service.remove_source({'id': 'sim'})
        self.assertEqual(self.service.tags(), [])
        self.assertEqual(self.service.sources(), [])

    def test_actions_and_events_count_as_usage(self):
        page = self.service.pages()[0]
        page['controls'] = [{'id': 'button', 'actions': [
            {'id': 'action', 'tag': 'counter', 'action': 'set', 'value': 5}],
            'events': [{'id': 'event', 'tag': 'counter', 'enabled': False}]}]
        self.service.save_page(page)
        self.assertEqual(len(self.service.usage('counter')), 1)
        with self.assertRaises(ValueError):
            self.service.remove_tag({'id': 'counter'})

    def test_source_fault_status(self):
        class Disconnected:
            def status(self):
                raise OSError('COM port disconnected')
        self.service.drivers['sim'] = Disconnected()
        status = self.service.source_catalog()[0]['status']
        self.assertEqual(status['quality'], 'bad')
        self.assertIn('COM port disconnected', status['message'])

    def test_save_preserves_draft_dangling_binding(self):
        page = self.service.pages()[0]
        page['controls'] = [{'id': 'bad', 'tag': 'missing'}]
        self.service.save_page(page)
        self.assertEqual(self.service.pages()[0]['controls'][0]['binding']['tag'], 'missing')

    def test_page_migration(self):
        path = Path(self.temp.name) / 'old.sqlite3'
        store = Store(path)
        store.set('page', {'controls': [{'id': 'legacy', 'text': 'Old'}]})
        service = Service(store)
        self.assertEqual(service.pages()[0]['controls'][0]['id'], 'legacy')


if __name__ == '__main__':
    unittest.main()
