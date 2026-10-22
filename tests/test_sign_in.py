import io,json,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from hmi.service import Service
from hmi.store import Store
from tests.http_helpers import make_handler

class SignInTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.service=Service(Store(Path(self.temp.name)/'test.sqlite3'));self.handler=make_handler(self.service)
 def tearDown(self):self.temp.cleanup()
 def request(self,path,data=None,cookie='',csrf=''):
  body=json.dumps(data).encode() if data is not None else b''
  raw=(f"{'POST' if data is not None else 'GET'} {path} HTTP/1.0\r\nContent-Length: {len(body)}\r\nContent-Type: application/json\r\nCookie: {cookie}\r\nX-CSRF-Token: {csrf}\r\n\r\n").encode()+body
  class Socket:
   output=io.BytesIO()
   def makefile(self,*args):return io.BytesIO(raw)
   def sendall(self,value):self.output.write(value)
  sock=Socket();self.handler(sock,('127.0.0.1',1234),SimpleNamespace());head,body=sock.output.getvalue().split(b'\r\n\r\n',1)
  headers=dict(line.split(': ',1) for line in head.decode().split('\r\n')[1:]);return int(head.split()[1]),json.loads(body),headers
 def test_automatic_setup_and_transition(self):
  self.assertTrue(self.request('/api/status')[1]['setup'])
  self.assertEqual(self.request('/api/setup',{'sign_in_required':False})[0],400)
  self.assertEqual(self.request('/api/setup',{'sign_in_required':False,'safety_acknowledged':True})[0],200)
  code,status,headers=self.request('/api/status');cookie=headers['Set-Cookie'].split(';')[0];csrf=status['csrf']
  self.assertFalse(status['setup']);self.assertEqual(status['username'],'User');self.assertTrue(status['user']['administrator'])
  self.assertEqual(self.request('/api/admin/sign-in',{'required':True},cookie)[0],403)
  self.assertEqual(self.request('/api/admin/sign-in',{'required':True,'username':'Admin','password':'short'},cookie,csrf)[0],400)
  self.assertTrue(self.request('/api/status',cookie=cookie)[1]['authenticated'])
  self.assertEqual(self.request('/api/setup',{'sign_in_required':False,'safety_acknowledged':True})[0],409)
  self.assertEqual(self.request('/api/admin/sign-in',{'required':True,'username':'Admin','password':'test-pass-123'},cookie,csrf)[0],200)
  self.assertFalse(self.request('/api/status',cookie=cookie)[1]['authenticated'])
  self.assertEqual(self.request('/api/admin/users',cookie=cookie)[0],401)
  code,_,headers=self.request('/api/login',{'username':'Admin','password':'test-pass-123'});self.assertEqual(code,200)
  cookie=headers['Set-Cookie'].split(';')[0];csrf=self.request('/api/status',cookie=cookie)[1]['csrf']
  self.assertEqual(self.request('/api/admin/sign-in',{'required':False},cookie,csrf)[0],200)
  status=self.request('/api/status')[1];self.assertEqual(status['username'],'User')
  self.assertEqual(len(self.service.store.get('users')),1)
 def test_existing_install_requires_login(self):
  self.request('/api/setup',{'username':'Admin','password':'test-pass-123','safety_acknowledged':True})
  self.assertFalse(self.request('/api/status')[1]['authenticated'])

 def test_combined_site_save_validates_before_committing(self):
  import socket
  from unittest.mock import Mock,patch
  self.request('/api/setup',{'sign_in_required':False,'safety_acknowledged':True})
  _,status,headers=self.request('/api/status');cookie=headers['Set-Cookie'].split(';')[0];csrf=status['csrf']
  self.service.server_settings.restart=Mock()
  self.service.store.set('site_logo',{'name':'Original'})
  settings={'sign_in':{'required':True,'username':'Admin','password':'test-pass-123'},'logo':None}
  self.assertEqual(self.request('/api/admin/site-configuration',settings,cookie)[0],403)
  with socket.socket() as listener:
   listener.bind(('127.0.0.1',0));listener.listen()
   self.assertEqual(self.request('/api/admin/site-configuration',{**settings,'port':listener.getsockname()[1]},cookie,csrf)[0],400)
  self.assertEqual(self.service.store.get('site_logo')['name'],'Original')
  self.assertFalse(self.service.store.get('sign_in_required'));self.assertEqual(self.service.store.get('users'),[])
  self.assertFalse(self.service.server_settings.pending)
  with socket.socket() as listener:listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
  with patch('hmi.server_settings.threading.Timer') as timer:
   code,result,_=self.request('/api/admin/site-configuration',{**settings,'port':port},cookie,csrf)
   self.assertEqual(code,200);self.assertTrue(result['restarting']);self.assertTrue(result['sign_in_changed']);timer.return_value.start.assert_called_once()
  self.assertEqual(self.service.store.get('server_port'),port);self.assertIsNone(self.service.store.get('site_logo'))
  self.assertTrue(self.service.store.get('sign_in_required'));self.assertEqual(self.service.store.get('users')[0]['username'],'Admin')
  self.assertEqual(self.request('/api/admin/users',cookie=cookie)[0],401)
 def test_logo_only_save_does_not_restart_or_sign_out(self):
  self.request('/api/setup',{'username':'Admin','password':'test-pass-123','safety_acknowledged':True})
  _,_,headers=self.request('/api/login',{'username':'Admin','password':'test-pass-123'})
  cookie=headers['Set-Cookie'].split(';')[0];csrf=self.request('/api/status',cookie=cookie)[1]['csrf']
  code,result,_=self.request('/api/admin/site-configuration',{'logo':None},cookie,csrf)
  self.assertEqual(code,200);self.assertFalse(result['sign_in_changed']);self.assertNotIn('restarting',result)
  self.assertTrue(self.request('/api/status',cookie=cookie)[1]['authenticated'])
