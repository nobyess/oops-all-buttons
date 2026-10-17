import test_core
import unittest

class ParameterTests(unittest.TestCase):
    setUp = test_core.ServiceTests.setUp
    tearDown = test_core.ServiceTests.tearDown

    def test_persistence_inline_bindings_and_rename(self):
        page = self.service.pages()[0]
        page['parameters'] = [{'id':'parameter:pv', 'name':'Value', 'description':'Current value'}]
        page['controls'] = [{'id':'label', 'type':'label', 'text':r'Value @{Parameters\Value}'}]
        self.service.save_page(page)
        saved = self.service.pages()[0]
        self.assertEqual(saved['controls'][0]['textRefs'][r'Parameters\Value'], 'parameter:pv')
        saved['parameters'][0]['name'] = 'Renamed'
        self.service.save_page(saved)
        self.assertEqual(self.service.pages()[0]['controls'][0]['textRefs'][r'Parameters\Value'], 'parameter:pv')

    def test_connections_protect_tag_usage(self):
        page = self.service.pages()[0]
        page['controls'] = [{'id':'open','actions':[{'action':'popup','page':'other','parameters':{'parameter:pv':'counter'}}]}]
        self.service.save_page(page)
        self.assertEqual(self.service.usage('counter')[0]['control'], 'open')
        with self.assertRaises(ValueError): self.service.remove_tag({'id':'counter'})

    def test_duplicate_parameter_names_rejected(self):
        page = self.service.pages()[0]
        page['parameters'] = [{'id':'parameter:a','name':'Value'},{'id':'parameter:b','name':'value'}]
        with self.assertRaises(ValueError): self.service.save_page(page)
