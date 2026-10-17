import unittest
from hmi.session_settings import session_settings, session_valid

class SessionSettingsTests(unittest.TestCase):
    def test_fixed_inactive_and_unlimited(self):
        record = {'created': 0, 'activity': 3500}
        self.assertFalse(session_valid(record, {'mode':'fixed','hours':1}, 3601))
        self.assertTrue(session_valid(record, {'mode':'inactivity','hours':1}, 3601))
        self.assertFalse(session_valid(record, {'mode':'inactivity','hours':1}, 7101))
        self.assertTrue(session_valid(record, {'mode':'never','hours':8}, 999999))
        self.assertFalse(session_valid(None, {'mode':'never','hours':8}))
        self.assertEqual(session_settings({}), {'mode':'fixed','hours':8})
        for data in [{'mode':'other'},{'hours':float('nan')},{'hours':0}]:
            with self.assertRaises(ValueError):session_settings(data)
