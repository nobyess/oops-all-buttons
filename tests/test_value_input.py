import unittest
from hmi.actions import validate_value_input
import test_core

class ValueInputTests(unittest.TestCase):
    setUp = test_core.ServiceTests.setUp
    tearDown = test_core.ServiceTests.tearDown
    def test_input_limits_and_write(self):
        action={'tag':'counter','action':'value_input','minimum':-2,'maximum':5,'allowDecimal':False}
        self.service.validate_rule('actions', action)
        self.service.act({**action,'value':3})
        self.assertEqual(self.service.values()['counter']['value'],3)
        for value in (5.1,1.5,float('nan')):
            with self.assertRaises(ValueError):self.service.act({**action,'value':value})
        self.service.act({**action,'allowDecimal':True,'value':1.5})
        self.assertEqual(self.service.values()['counter']['value'],1.5)
        with self.assertRaises(ValueError):validate_value_input({'minimum':10,'maximum':0})

    def test_prompt_and_unit_text_validation(self):
        settings={'minimum':0,'maximum':100,'promptText':'Pump Speed Setpoint','unitText':'RPM'}
        validate_value_input(settings)
        self.service.validate_controls([{'id':'number','type':'numeric','promptText':'Speed','unitText':'RPM'}])
        for key,value in [('promptText',None),('promptText','x'*201),('unitText',{}),('unitText','x'*81)]:
            with self.subTest(key=key),self.assertRaises(ValueError):validate_value_input({**settings,key:value})
            if key=='unitText':
                with self.subTest(key=key),self.assertRaises(ValueError):self.service.validate_controls([{'id':'number','type':'numeric',key:value}])

    def test_numeric_control_prompt_removed_without_touching_action_prompt(self):
        control={'id':'number','type':'numeric','promptText':'Old control prompt','unitText':'RPM','actions':[{'id':'input','action':'value_input','promptText':'Pump Speed Setpoint','unitText':'RPM'}]}
        self.service.migrate_controls([control])
        self.assertNotIn('promptText',control)
        self.assertEqual(control['unitText'],'RPM')
        self.assertEqual(control['actions'][0]['promptText'],'Pump Speed Setpoint')
