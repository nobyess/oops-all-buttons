import base64,io,json,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from hmi.store import Store
from hmi.service import Service
from hmi.access import Access
from tests.http_helpers import make_handler
class SiteTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.service=Service(Store(Path(self.temp.name)/'hmi.sqlite3'))
  access=Access(self.service);access.save_user({'username':'Admin','password':'site-test-123'},setup=True)
  access.save_user({'username':'Operator','password':'site-test-123'})
  self.root=Path(self.temp.name)/'application';self.root_patch=patch('run.ROOT',self.root);self.root_patch.start()
  self.handler=make_handler(self.service)
  self.logo={'name':'Logo.svg','data':base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>').decode()}
 def tearDown(self):
  self.root_patch.stop()
  for driver in self.service.drivers.values():driver.close()
  self.temp.cleanup()
 def request(self,path,data=None,cookie='',csrf=''):
  body=json.dumps(data).encode() if data is not None else b''
  raw=(('POST' if data is not None else 'GET')+' '+path+' HTTP/1.0\r\n'+f'Cookie: {cookie}\r\nX-CSRF-Token: {csrf}\r\nContent-Length: {len(body)}\r\n\r\n').encode()+body
  class Socket:
   def __init__(self):self.output=io.BytesIO()
   def makefile(self,*args):return io.BytesIO(raw)
   def sendall(self,value):self.output.write(value)
  sock=Socket();self.handler(sock,('127.0.0.1',1),SimpleNamespace())
  head,body=sock.output.getvalue().split(b'\r\n\r\n',1);lines=head.decode().split('\r\n');headers=dict(line.split(': ',1) for line in lines[1:])
  return int(lines[0].split()[1]),json.loads(body) if headers.get('Content-Type')=='application/json' else body,headers
 def login(self,name):
  _,_,headers=self.request('/api/login',{'username':name,'password':'site-test-123'});cookie=headers['Set-Cookie']
  return cookie,self.request('/api/status',cookie=cookie)[1]['csrf']
 def test_logo_is_public_but_site_editing_requires_admin_and_csrf(self):
  self.assertFalse(self.request('/api/status')[1]['site_logo'])
  self.assertEqual(self.request('/api/site/logo')[0],404)
  self.assertEqual(self.request('/api/admin/site',{'logo':self.logo})[0],401)
  operator,token=self.login('Operator')
  self.assertEqual(self.request('/api/admin/site',cookie=operator)[0],403)
  self.assertEqual(self.request('/api/admin/site',{'logo':self.logo},operator,token)[0],403)
  admin,token=self.login('Admin')
  self.assertEqual(self.request('/api/admin/site',{'logo':self.logo},admin)[0],403)
  self.assertEqual(self.request('/api/admin/site',{'logo':self.logo},admin,token)[0],200)
  self.assertTrue(self.request('/api/status')[1]['site_logo'])
  status,raw,headers=self.request('/api/site/logo')
  self.assertEqual(status,200);self.assertEqual(raw,base64.b64decode(self.logo['data']))
  self.assertEqual(headers['Content-Type'],'image/svg+xml');self.assertEqual(headers['Cache-Control'],'no-store')
  self.assertIn('sandbox',headers['Content-Security-Policy'])
  self.assertEqual(self.request('/api/images/private')[0],401)
  self.assertEqual(self.request('/api/admin/site',cookie=admin)[1]['logo_name'],'Logo.svg')
 def test_invalid_replacement_preserves_logo_and_remove_clears_it(self):
  admin,token=self.login('Admin');self.request('/api/admin/site',{'logo':self.logo},admin,token)
  for logo in ({'data':'invalid'}, {'data':base64.b64encode(b'<html/>').decode()}):
   self.assertEqual(self.request('/api/admin/site',{'logo':logo},admin,token)[0],400)
   self.assertEqual(self.request('/api/site/logo')[0],200)
  self.assertEqual(self.request('/api/admin/site',{'logo':None},admin,token)[0],200)
  self.assertFalse(self.request('/api/status')[1]['site_logo'])
  self.assertEqual(self.request('/api/site/logo')[0],404)

 def test_bundled_default_custom_override_and_reset(self):
  image=self.root/'static'/'images'/'default-logo.webp';image.parent.mkdir(parents=True)
  raw=b'RIFF\x18\x00\x00\x00WEBPDefault test image';image.write_bytes(raw)
  self.assertTrue(self.request('/api/status')[1]['site_logo'])
  status,content,headers=self.request('/api/site/logo');self.assertEqual(status,200)
  self.assertEqual(content,raw);self.assertEqual(headers['Content-Type'],'image/webp')
  admin,token=self.login('Admin')
  self.assertTrue(self.request('/api/admin/site',cookie=admin)[1]['default_logo'])
  self.request('/api/admin/site',{'logo':self.logo},admin,token)
  self.assertEqual(self.request('/api/site/logo')[1],base64.b64decode(self.logo['data']))
  self.request('/api/admin/site',{'logo':None},admin,token)
  self.assertEqual(self.request('/api/site/logo')[1],raw)
