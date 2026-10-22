import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from hmi.service import Service
from hmi.store import Store
from hmi.access import Access
from tests.http_helpers import make_handler
from tests import test_assets as asset_test_helpers
from hmi.source_pause import PauseGate
from hmi.lightyak import LightYakDriver
from hmi.modbus import ModbusTCPDriver
from tests.test_lightyak import Device
from tests.test_modbus_rtu import SerialClient

class NetworkDriver:
    def __init__(self,settings):self.reads=0;self.writes=0;self.closes=0;self.entered=threading.Event();self.release=None
    def status(self):return {'quality':'good','message':'Connected'}
    def read_many(self,addresses):
        self.reads+=1
        if self.release:self.entered.set();self.release.wait(3)
        return {a:{'value':10,'quality':'good'} for a in addresses}
    def read(self,address):return self.read_many([address])[address]['value']
    def write(self,address,value):self.writes+=1
    def describe(self,address):return {'type':'REAL','writable':True}
    def test(self):return {'ok':True}
    def close(self):self.closes+=1

class SourcePauseTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.service=Service(Store(Path(self.temp.name)/'test.sqlite3'))
    def tearDown(self):
        for driver in self.service.drivers.values():driver.close()
        self.temp.cleanup()
    def add_network(self):
        with patch.dict('hmi.service.DRIVERS',pycomm3=NetworkDriver):
            self.service.add_source({'id':'net','kind':'pycomm3','settings':{'path':'127.0.0.1','plc_type':'controllogix'}})
        self.service.store.set('tags',[{'id':'n','source':'net','name':'Number','address':'Value','data_type':'REAL'}]);self.service.configure_polling()
        return self.service.drivers['net']
    def test_network_pause_retains_connection_blocks_io_and_resumes_immediately(self):
        s=self.service;driver=self.add_network();s.polling.poll_due(False);count=driver.reads
        s.pause_source({'id':'net','paused':True})
        self.assertEqual(driver.closes,0)
        s.polling.interest('live',{'n'});s.polling.poll_due(False)
        self.assertEqual(driver.reads,count)
        sample=s.values({'n'})['n'];self.assertIsNone(sample['value']);self.assertEqual(sample['quality'],'bad');self.assertTrue(sample['paused'])
        for operation in (lambda:driver.test(),lambda:s.act({'tag':'n','action':'set','value':4}),lambda:s.test_source({'id':'net'})):
            with self.assertRaisesRegex(ValueError,'paused'):operation()
        self.assertEqual(s.preview_source_tag({'source':'net','address':'Value'})['quality'],'bad')
        self.assertEqual(driver.writes,0)
        for rows in (s.source_status(),s.source_catalog(),s.source_diagnostics()):self.assertTrue(next(row for row in rows if row['id']=='net')['status']['paused'])
        s.pause_source({'id':'net','paused':False});s.polling.poll_due(False)
        self.assertEqual(driver.reads,count+1);self.assertEqual(s.values({'n'})['n']['quality'],'good');self.assertEqual(driver.closes,0)
    def test_pause_waits_for_inflight_read_and_discards_it(self):
        s=self.service;driver=self.add_network();driver.release=threading.Event()
        s.polling.poll_due(True);self.assertTrue(driver.entered.wait(2))
        finished=threading.Event()
        thread=threading.Thread(target=lambda:(s.pause_source({'id':'net','paused':True}),finished.set()));thread.start()
        self.assertFalse(finished.wait(.05));driver.release.set();thread.join(2)
        self.assertTrue(finished.is_set());self.assertEqual(s.values({'n'})['n']['quality'],'bad')
        self.assertEqual(driver.closes,0)
    def test_lightyak_shared_port_released_and_cannot_be_reopened_by_tests(self):
        s=self.service;device=Device()
        with patch.dict('hmi.service.DRIVERS',lightyak=lambda settings:LightYakDriver(settings,device.factory)):
            for identity in ('one','two'):s.add_source({'id':identity,'kind':'lightyak','settings':{'serial_port':'COM950'}})
            s.drivers['one'].test();self.assertEqual(device.opens,1)
            result=s.pause_source({'id':'one','paused':True});self.assertEqual(set(result['sources']),{'one','two'})
            self.assertEqual(device.closes,1)
            for identity in ('one','two'):
                with self.assertRaisesRegex(ValueError,'paused'):s.drivers[identity].browse()
            with self.assertRaisesRegex(ValueError,'paused'):s.test_source({'kind':'lightyak','settings':{'serial_port':'com0950'}})
            self.assertEqual(device.opens,1)
            s.pause_source({'id':'two','paused':False});s.drivers['one'].test();self.assertEqual(device.opens,2)
    def test_modbus_shared_serial_bus_releases_port_without_destroying_sources(self):
        s=self.service
        with patch.dict('hmi.service.DRIVERS',modbus=lambda settings:ModbusTCPDriver(settings,SerialClient)):
            for unit in (1,2):s.add_source({'id':'rtu'+str(unit),'kind':'modbus','settings':{'transport':'rtu','serial_port':'COM951','unit_id':unit}})
            driver=s.drivers['rtu1'];driver.test();client=driver.client
            self.assertTrue(client.connected)
            s.pause_source({'id':'rtu1','paused':True});self.assertFalse(client.connected)
            self.assertFalse(driver.closed);self.assertEqual(client.closes,1)
            with self.assertRaisesRegex(ValueError,'paused'):s.drivers['rtu2'].read('holding:0:uint16:big:big')
            s.pause_source({'id':'rtu2','paused':False});self.assertEqual(driver.read('holding:1:uint16:big:big'),1)
            self.assertTrue(client.connected)
    def test_internal_sources_and_invalid_requests_rejected(self):
        for data in ({'id':'system','paused':True},{'id':'missing','paused':True},{'id':'system','paused':'true'}):
            with self.assertRaises(ValueError):self.service.pause_source(data)

    def test_pause_api_requires_administrator_and_csrf(self):
        import json
        s=self.service;self.add_network();access=Access(s)
        access.save_user({'username':'Admin','password':'pause-test-123'},setup=True)
        access.save_user({'username':'Viewer','password':'pause-test-123'})
        self.handler=make_handler(s)
        def login(name):
            _,_,headers=asset_test_helpers.AssetTests.request(self,'/api/login',{'username':name,'password':'pause-test-123'})
            cookie=headers['Set-Cookie']
            csrf=json.loads(asset_test_helpers.AssetTests.request(self,'/api/status',cookie=cookie)[1])['csrf']
            return cookie,csrf
        cookie,csrf=login('Viewer')
        self.assertEqual(asset_test_helpers.AssetTests.request(self,'/api/sources/pause',{'id':'net','paused':True},cookie,csrf)[0],403)
        cookie,csrf=login('Admin')
        self.assertEqual(asset_test_helpers.AssetTests.request(self,'/api/sources/pause',{'id':'net','paused':True},cookie,'wrong')[0],403)
        self.assertEqual(asset_test_helpers.AssetTests.request(self,'/api/sources/pause',{'id':'net','paused':True},cookie,csrf)[0],200)
        self.assertTrue(s.drivers['net'].status()['paused'])

    def test_failed_driver_still_pauses_and_restart_state_is_not_persisted(self):
        s=self.service;driver=self.add_network();driver.close();s.drivers.pop('net');s.configure_polling()
        s.pause_source({'id':'net','paused':True});s.polling.poll_due(False)
        self.assertNotIn('net',s.polling.statistics)
        self.assertTrue(next(row for row in s.source_status() if row['id']=='net')['status']['paused'])
        self.assertFalse(any(source.get('paused') for source in s.sources()))
