import test_core
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

class PreviewTests(unittest.TestCase):
    setUp = test_core.ServiceTests.setUp
    tearDown = test_core.ServiceTests.tearDown

    def prepare(self, value=True):
        self.service.store.set('sources',[{'id':'sim','name':'PLC','kind':'pycomm3','settings':{'protocol':'logix'}}])
        driver=SimpleNamespace(describe=Mock(return_value={'type':'BOOL'}),read=Mock(return_value=value),write=Mock())
        self.service.drivers['sim']=driver
        return driver

    def test_preview_reads_without_adding_or_writing(self):
        driver=self.prepare()
        before=self.service.tags()
        result=self.service.preview_source_tag({'source':'sim','address':'RunMotor'})
        self.assertEqual(result['quality'],'good');self.assertIs(result['value'],True)
        driver.read.assert_called_once_with('RunMotor');driver.write.assert_not_called()
        self.assertEqual(before,self.service.tags())

    def test_failure_is_unavailable(self):
        driver=self.prepare();driver.read.side_effect=ValueError('Disconnected')
        result=self.service.preview_source_tag({'source':'sim','address':'RunMotor'})
        self.assertEqual(result['quality'],'bad');self.assertEqual(result['error'],'Disconnected')

    def test_non_logix_source_is_rejected(self):
        with self.assertRaises(ValueError):self.service.preview_source_tag({'source':'sim','address':'RunMotor'})

    def test_structured_values_are_not_previewed(self):
        self.prepare({'member':1})
        self.assertEqual(self.service.preview_source_tag({'source':'sim','address':'Struct'})['quality'],'bad')

    def test_bacnet_preview_uses_property_read(self):
        driver=self.prepare(21.5)
        self.service.store.set('sources',[{'id':'sim','name':'BACnet','kind':'bacnet','settings':{}}])
        result=self.service.preview_source_tag({'source':'sim','address':'1443213/2:200/presentValue'})
        self.assertEqual(result['value'],21.5);self.assertEqual(result['quality'],'good')
        driver.describe.assert_not_called();driver.write.assert_not_called()
