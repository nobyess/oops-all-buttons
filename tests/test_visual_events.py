import test_core
import unittest

class VisualConfigurationTests(unittest.TestCase):
    setUp = test_core.ServiceTests.setUp
    tearDown = test_core.ServiceTests.tearDown

    def test_events_are_saved_but_not_evaluated_on_the_server(self):
        page=self.service.pages()[0]
        page['controls']=[{'id':'display','events':[{'id':'event','tag':'counter','operator':'>','operand':{'value':5},'action':'hide'}]}]
        self.service.save_page(page)
        self.assertEqual(self.service.pages()[0]['controls'][0]['events'][0]['action'],'hide')
        self.assertFalse(hasattr(self.service,'tick'))
        self.assertFalse(hasattr(self.service,'run_events'))
        response=self.service.batch_values({'tags':['counter'],'pages':['main']})
        self.assertNotIn('controlStates',response)
        self.assertNotIn('stateRevision',response)
        with self.assertRaises(ValueError):self.service.remove_tag({'id':'counter'})

    def test_unbound_control_and_disabled_incomplete_action_save(self):
        page = self.service.pages()[0]
        page['controls'] = [{'id': 'button', 'type': 'button', 'actions': [
            {'id': 'draft', 'enabled': False, 'tag': '', 'trigger': 'click', 'action': 'increment'}]}]
        self.service.save_page(page)
        page['controls'][0]['actions'][0]['enabled'] = True
        with self.assertRaises(ValueError):
            self.service.validate_rule('actions', page['controls'][0]['actions'][0])
        warnings = self.service.save_page(page)
        self.assertEqual(warnings, [])
        self.assertNotIn('enabled', self.service.pages()[0]['controls'][0]['actions'][0])

    def test_old_binding_migrates_out_of_control_properties(self):
        page = self.service.pages()[0]
        page['controls'] = [{'id': 'display', 'type': 'numeric', 'tag': 'counter'}]
        self.service.save_page(page)
        stored = self.service.pages()[0]['controls'][0]
        self.assertNotIn('tag', stored)
        self.assertEqual(stored['binding']['tag'], 'counter')

    def test_spin_speed_validation(self):
        rule={'id':'spin','tag':'counter','operator':'>','operand':{'value':0},'action':'spin','rpm':30}
        self.service.validate_rule('events',rule)
        for speed in [-1,61,float('inf'),True,'10']:
            with self.assertRaises(ValueError):
                self.service.validate_rule('events',{**rule,'rpm':speed})

    def test_control_names_default_to_ids_and_survive_rename(self):
        page=self.service.pages()[0]
        page['controls']=[{'id':'display_1','type':'label','text':'Process Value'}, {'id':'symbol_1','type':'symbol'}]
        self.service.save_page(page)
        stored=self.service.pages()[0]
        self.assertEqual([c['name'] for c in stored['controls']],['display_1','symbol_1'])
        stored['controls'][0]['name']='Tank Level'
        self.service.save_page(stored)
        renamed=self.service.pages()[0]['controls'][0]
        self.assertEqual(renamed['name'],'Tank Level')
        self.assertEqual(renamed['id'],'display_1')
        self.assertEqual(renamed['text'],'Process Value')

    def test_references_keep_control_id_and_show_control_name(self):
        page=self.service.pages()[0]
        page['name']='Main'
        page['controls']=[{'id':'button_123','type':'button','name':'Start Button','actions':[{'id':'press','trigger':'click','action':'set','tag':'counter','value':1}]}]
        self.service.save_page(page)
        use=self.service.usage('counter')[0]
        self.assertEqual(use['name'],'Main')
        self.assertEqual(use['control'],'button_123')
        self.assertEqual(use['controlName'],'Start Button')
        page['controls'][0]['name']='Run Button'
        self.service.save_page(page)
        self.assertEqual(self.service.usage('counter')[0]['controlName'],'Run Button')
