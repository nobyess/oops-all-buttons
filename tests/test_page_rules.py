import unittest
import test_core
from hmi.polling import page_tags

class PageRuleTests(unittest.TestCase):
    setUp=test_core.ServiceTests.setUp
    tearDown=test_core.ServiceTests.tearDown
    def test_page_rule_persistence_usage_and_interest(self):
        page=self.service.pages()[0]
        page['actions']=[{'id':'open','trigger':'page_open','tag':'counter','action':'set','value':1},
                         {'id':'close','trigger':'page_close','tag':'counter','action':'set','value':0}]
        page['events']=[{'id':'close-popup','tag':'counter','operator':'=','operand':{'value':1},'action':'close_popup'}]
        self.service.save_page(page)
        for item in page['actions']:self.service.validate_rule('actions',item)
        self.service.validate_rule('events',page['events'][0])
        self.assertEqual(self.service.pages()[0]['events'],page['events'])
        self.assertEqual(page_tags(page),{'counter'})
        self.assertEqual(self.service.usage('counter')[0]['control'],'@page')
        with self.assertRaises(ValueError):self.service.remove_tag({'id':'counter'})
        self.service.live_interest('view',{'pages':[page['id']]})
        self.assertIn('counter',self.service.polling.leases['view'][1])
        destination=self.service.add_page({'name':'Destination'})
        page['actions'].append({'id':'navigate','trigger':'page_open','action':'navigate','page':destination['id']})
        self.service.save_page(page)
        self.assertEqual(self.service.page_usage(destination['id'])[0]['control'],'@page')

    def test_navigation_is_not_allowed_for_page_lifecycle(self):
        for trigger in ('page_open','page_close'):
            for action in ('navigate','popup'):
                with self.assertRaises(ValueError):
                    self.service.validate_rule('actions',{'trigger':trigger,'action':action,'page':'main'})
        self.service.validate_rule('actions',{'trigger':'click','action':'navigate','page':'main'})
