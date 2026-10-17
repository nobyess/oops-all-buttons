import importlib.util
import unittest
import json
import tempfile
from pathlib import Path
from hmi.service import Service
from hmi.store import Store
from types import SimpleNamespace
from unittest.mock import patch
from hmi.pycomm3_modes import PyComm3CIPDriver, PyComm3SLCDriver, classify_device, explicit_path, auto_select

AVAILABLE = importlib.util.find_spec('pycomm3') is not None

class FakeCIP:
    instances = []
    def __init__(self, path):
        self.path = path
        self.connected = False
        self._cfg = {'cip_path': ['backplane', 0] if '/' in path else []}
        self.calls = []
        self.__class__.instances.append(self)
    def open(self):self.connected = True;return True
    def close(self):self.connected = False
    def generic_message(self, **kwargs):
        self.calls.append(kwargs)
        value = {'product_name': '1756-L81E/B'} if kwargs['service'] == 1 else 2
        return SimpleNamespace(value=value, error=None)
    def read(self, *addresses):
        replies = [SimpleNamespace(value=1, error=None) for item in addresses]
        return replies[0] if len(replies)==1 else replies
    def write(self, item):self.calls.append(item);return SimpleNamespace(error=None)

class ClassificationTests(unittest.TestCase):
    def test_protocol_classification_and_paths(self):
        for model, kind in [('1756-L81E/B','logix'), ('1769-L16ER','logix'), ('2080-LC50','logix'),
                            ('MicroLogix 1400','slc'), ('1747-L551','slc'), ('PowerFlex 525','cip'), ('1756-ENBT','cip')]:
            self.assertEqual(classify_device({'product_name': model}),kind)
        self.assertEqual(explicit_path('192.0.2.1/0'),'192.0.2.1/backplane/0')
        self.assertEqual(explicit_path('192.0.2.1'),'192.0.2.1')

@unittest.skipUnless(AVAILABLE, 'Optional pycomm3 not installed')
class ProtocolTests(unittest.TestCase):
    def test_cip_read_write_uses_explicit_scalar_attributes_and_route(self):
        driver=PyComm3CIPDriver({'protocol':'cip','path':'192.0.2.1/0'},FakeCIP)
        self.assertEqual(driver.test()['message'],'1756-L81E/B')
        self.assertEqual(driver.read('0x04/100/3:REAL'),2)
        call=driver.plc.calls[-1]
        self.assertEqual((call['service'],call['class_code'],call['instance'],call['attribute']),(14,4,100,3))
        self.assertTrue(call['unconnected_send'])
        driver.write('4/100/3:INT',3)
        self.assertEqual(driver.plc.calls[-1]['request_data'],b'\x03\x00')
        self.assertEqual(driver.plc.calls[-1]['service'],16)
        with self.assertRaises(ValueError):driver.write('4/100/3:INT',1.2)
        with self.assertRaises(ValueError):driver.describe('4/100/3:STRING')
        driver.close()

    def test_slc_addresses_and_operations(self):
        driver=PyComm3SLCDriver({'protocol':'slc','path':'192.0.2.1'},FakeCIP)
        for address,dtype in [('N7:0','INT'),('F8:0','REAL'),('B3:0/0','BOOL'),('T4:0.ACC','INT'),('T4:0.DN','BOOL')]:
            self.assertEqual(driver.describe(address)['type'],dtype)
        for address in ('T4:0','N7:0{3}','bad','N7:0junk'):
            with self.assertRaises(ValueError):driver.describe(address)
        self.assertEqual(driver.read('N7:0'),1)
        driver.write('B3:0/0',1)
        self.assertEqual(driver.plc.calls[-1],('B3:0/0',True))
        driver.close()

    def test_auto_select_queries_routed_device_without_writes(self):
        with patch('pycomm3.CIPDriver',FakeCIP):
            result=auto_select({'path':'192.0.2.1/0','timeout':3})
        json.dumps(result)
        self.assertEqual(result['protocol'],'logix')
        plc=FakeCIP.instances[-1]
        self.assertEqual(plc.path,'192.0.2.1/backplane/0')
        self.assertFalse(plc.connected)
        self.assertGreaterEqual(plc.socket_timeout,5)
        self.assertEqual([call['service'] for call in plc.calls],[1])

    def test_protocol_sources_import_poll_and_write_through_service(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            service=Service(Store(Path(folder)/'hmi.sqlite3'))
            with patch('pycomm3.SLCDriver',FakeCIP), patch('pycomm3.CIPDriver',FakeCIP):
                for kind,address in [('slc','N7:0'),('cip','4/100/3:INT')]:
                    service.add_source({'id':kind,'kind':'pycomm3','settings':{'protocol':kind,'path':'192.0.2.1'}})
                    service.add_tag({'id':kind+'tag','source':kind,'address':address})
                    service.act({'tag':kind+'tag','action':'set','value':5})
                    self.assertIsNone(service.values()[kind+'tag']['value'])
                service.polling.poll_due(False)
                self.assertEqual(service.values()['slctag']['value'],1)
                self.assertEqual(service.values()['ciptag']['value'],2)
                with self.assertRaises(ValueError):
                    service.edit_source({'id':'slc','settings':{'protocol':'cip','path':'192.0.2.1'}})
            for driver in service.drivers.values():driver.close()

    def test_detection_failure_has_popup_message_and_closes_session(self):
        class Failed(FakeCIP):
            def open(self):raise OSError('Connection refused')
        with patch('pycomm3.CIPDriver',Failed):
            with self.assertRaisesRegex(ValueError,'Auto Select failed: Connection refused'):
                auto_select({'path':'192.0.2.1'})
        self.assertFalse(Failed.instances[-1].connected)
