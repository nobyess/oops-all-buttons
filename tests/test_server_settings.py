import json
import socket
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock,patch
from hmi.store import Store
from hmi.service import Service
from hmi.server_settings import ServerSettings,port_number
from hmi.access import Access
from tests.http_helpers import make_handler
from tests import test_assets as helpers

class ServerSettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(Path(self.temp.name)/'hmi.sqlite3');self.settings=ServerSettings(self.store)
    def tearDown(self):self.temp.cleanup()
    def test_validation_and_startup_precedence(self):
        for value in (0,65536,-1,True,None,'1.5',1.5,float('nan')):
            with self.subTest(value=value),self.assertRaises(ValueError):port_number(value)
        self.assertEqual(self.settings.startup_port(),8080)
        self.store.set('server_port',8090)
        self.assertEqual(self.settings.startup_port(),8090)
        self.assertEqual(self.settings.startup_port(8091,explicit=True),8091)
    def test_save_then_deferred_restart_and_duplicate_guard(self):
        callback=Mock();self.settings.restart=callback
        with patch('hmi.server_settings.threading.Timer') as timer:
            result=self.settings.apply({'port':8080})
            self.assertEqual(result['port'],8080);self.assertEqual(self.store.get('server_port'),8080)
            self.assertTrue(self.settings.snapshot()['pending'])
            callback.assert_not_called();timer.assert_called_once_with(.3,callback,args=(8080,));timer.return_value.start.assert_called_once()
            with self.assertRaisesRegex(ValueError,'pending'):self.settings.apply({'port':8081})
    def test_occupied_port_is_rejected_without_saving_or_restarting(self):
        self.settings.restart=Mock()
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',0));listener.listen()
            with self.assertRaisesRegex(ValueError,'cannot be used'):self.settings.apply({'port':listener.getsockname()[1]})
        self.assertIsNone(self.store.get('server_port'));self.settings.restart.assert_not_called();self.assertFalse(self.settings.pending)
    def test_apply_on_available_port(self):
        self.settings.restart=Mock()
        with socket.socket() as listener:listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
        with patch('hmi.server_settings.threading.Timer'):self.settings.apply({'port':port})
        self.assertEqual(self.store.get('server_port'),port)
    def test_unavailable_restart_rejected(self):
        with self.assertRaisesRegex(ValueError,'unavailable'):self.settings.apply({'port':8080})
        self.assertIsNone(self.store.get('server_port'))
    def test_api_admin_and_csrf_required(self):
        service=Service(self.store);self.handler=make_handler(service)
        try:
            access=Access(service);access.save_user({'username':'Admin','password':'settings-test-123'},setup=True);access.save_user({'username':'Viewer','password':'settings-test-123'})
            def request(*args,**kwargs):return helpers.AssetTests.request(self,*args,**kwargs)
            def login(name):
                _,_,headers=request('/api/login',{'username':name,'password':'settings-test-123'});cookie=headers['Set-Cookie']
                return cookie,json.loads(request('/api/status',cookie=cookie)[1])['csrf']
            cookie,csrf=login('Viewer')
            self.assertEqual(request('/api/admin/server-settings',cookie=cookie)[0],403)
            self.assertEqual(request('/api/admin/server-settings',{'port':8080},cookie,csrf)[0],403)
            cookie,csrf=login('Admin');service.server_settings.restart=Mock()
            self.assertEqual(request('/api/admin/server-settings',cookie=cookie)[0],200)
            self.assertEqual(request('/api/admin/server-settings',{'port':8080},cookie,'wrong')[0],403)
            with patch('hmi.server_settings.threading.Timer'):
                self.assertEqual(request('/api/admin/server-settings',{'port':8080},cookie,csrf)[0],200)
        finally:
            for driver in service.drivers.values():driver.close()
