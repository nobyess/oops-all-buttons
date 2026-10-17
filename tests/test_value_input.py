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
