import test_core
import unittest


class PageTests(unittest.TestCase):
    setUp = test_core.ServiceTests.setUp
    tearDown = test_core.ServiceTests.tearDown

    def test_enable_validation_and_save_invalid_event(self):
        item = {'id': 'draft', 'enabled': False, 'tag': '', 'operator': '>',
                'operand': {'kind': 'value', 'value': 1}, 'action': 'hide'}
        with self.assertRaises(ValueError): self.service.validate_rule('events', item)
        page = self.service.pages()[0]
        item['enabled'] = True
        page['controls'] = [{'id': 'label1', 'text': 'Status', 'events': [item]}]
        warnings = self.service.save_page(page)
        self.assertEqual(warnings, [])
        self.assertNotIn('enabled', self.service.pages()[0]['controls'][0]['events'][0])
        self.assertFalse(hasattr(self.service,'tick'))

    def test_page_background_visibility(self):
        page=self.service.pages()[0]
        self.assertTrue(page['showBackground'])
        page['showBackground']=False
        self.service.save_page(page)
        self.assertFalse(self.service.pages()[0]['showBackground'])
        page['showBackground']='false'
        with self.assertRaises(ValueError):self.service.save_page(page)

    def test_layout_defaults_and_persistence(self):
        page = self.service.pages()[0]
        self.assertEqual(page['width'], 1000)
        self.assertTrue(page['showBorder'])
        page.update(width=420, height=240, backColor='#123456', horizontalAlignment='center', verticalAlignment='bottom')
        self.service.save_page(page)
        self.assertEqual(self.service.pages()[0]['horizontalAlignment'], 'center')
        page['backColor'] = '#12345680'
        self.service.save_page(page)
        self.assertEqual(self.service.pages()[0]['backColor'], '#12345680')
        page['showBorder'] = False
        self.service.save_page(page)
        self.assertFalse(self.service.pages()[0]['showBorder'])
        page['showBorder'] = 'false'
        with self.assertRaises(ValueError): self.service.save_page(page)
        page['showBorder'] = False
        page['height'] = -1
        with self.assertRaises(ValueError): self.service.save_page(page)

    def test_navigation_and_popup_without_tag(self):
        destination = self.service.add_page({'name':'Details'})
        page = self.service.pages()[0]
        for action_type in ('navigate', 'popup'):
            page['controls'] = [{'id':'button','type':'button','actions':[
                {'id':'a','enabled':True,'action':action_type,'page':destination['id'],'trigger':'click','position':'mouse'}]}]
            self.service.save_page(page)
            with self.assertRaises(ValueError): self.service.remove_page({'id':destination['id']})
        page['controls'][0]['actions'][0]['page']='missing'
        with self.assertRaises(ValueError): self.service.validate_rule('actions', page['controls'][0]['actions'][0])
        self.assertEqual(self.service.save_page(page), [])
        self.assertNotIn('enabled', self.service.pages()[0]['controls'][0]['actions'][0])

    def test_grid_settings_are_saved_per_page(self):
        first = self.service.pages()[0]
        second = self.service.add_page({'name':'Second'})
        first.update(gridSize=5, gridStyle='dots')
        second.update(gridSize=0, gridStyle='hide')
        self.service.save_page(first);self.service.save_page(second)
        restored = type(self.service)(self.service.store)
        pages = {page['id']:page for page in restored.pages()}
        self.assertEqual((pages[first['id']]['gridSize'],pages[first['id']]['gridStyle']),(5,'dots'))
        self.assertEqual((pages[second['id']]['gridSize'],pages[second['id']]['gridStyle']),(0,'hide'))
        first['gridSize']=3
        with self.assertRaises(ValueError):self.service.save_page(first)

    def test_numeric_display_digits_persist_and_validate(self):
        page=self.service.pages()[0]
        page['controls']=[{'id':'n','type':'numeric','binding':{'tag':'counter'},'displayDigits':3}]
        self.service.save_page(page)
        self.assertEqual(self.service.pages()[0]['controls'][0]['displayDigits'],3)
        for value in (-1,16,1.5):
            page['controls'][0]['displayDigits']=value
            with self.assertRaises(ValueError):self.service.save_page(page)
