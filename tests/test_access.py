import unittest,tempfile,json,io
from pathlib import Path
from types import SimpleNamespace
from hmi.store import Store
from hmi.service import Service
from hmi.access import Access,password_hash
from run import make_handler

class AccessTests(unittest.TestCase):
 def setUp(self):
  self.folder=tempfile.TemporaryDirectory();self.service=Service(Store(Path(self.folder.name)/'db.sqlite3'));self.access=Access(self.service)
 def tearDown(self):self.folder.cleanup()
 def test_app_background_is_per_user_and_validated(self):
  admin=self.access.save_user({'username':'Admin','password':'12345678','app_background':'#123456'},setup=True)
  viewer=self.access.save_user({'username':'Viewer','password':'12345678'})
  self.assertEqual(self.access.public(admin)['app_background'],'#123456')
  self.assertEqual(self.access.public(viewer)['app_background'],'')
  with self.assertRaises(ValueError):self.access.save_user({'id':viewer['id'],'username':'Viewer','app_background':'url(bad)'})
  self.access.save_user({'id':admin['id'],'username':'Admin','administrator':True,'app_background':''})
  self.assertEqual(self.access.public(self.access.login('Admin','12345678'))['app_background'],'')
 def test_eight_character_password_minimum(self):
  with self.assertRaises(ValueError):self.access.save_user({'username':'Admin','password':'1234567'},setup=True)
  admin=self.access.save_user({'username':'Admin','password':'12345678'},setup=True)
  self.assertIsNotNone(self.access.login('Admin','12345678'))
  with self.assertRaises(ValueError):self.access.save_user({'id':admin['id'],'username':'Admin','password':'short'})
  self.assertIsNotNone(self.access.login('Admin','12345678'))
 def test_role_membership_editor_preserves_other_roles(self):
  admin=self.access.save_user({'username':'Admin','password':'test-password-123'},setup=True)
  viewer=self.access.save_user({'username':'Viewer','password':'viewer-password-123'})
  first=self.access.save_role({'name':'First','users':[admin['id'],viewer['id']]})
  second=self.access.save_role({'name':'Second','users':[viewer['id']]})
  self.access.save_role({'id':first['id'],'name':'Renamed','users':[admin['id']]})
  user=self.access.save_user({'id':viewer['id'],'username':'Viewer','theme':'dark'})
  self.assertEqual(user['roles'],[second['id']])
  before=self.access.roles()
  with self.assertRaises(ValueError):self.access.save_role({'id':first['id'],'name':'Bad rename','users':['missing']})
  self.assertEqual(self.access.roles(),before)
  self.assertIn(first['id'],self.access.login('Admin','test-password-123')['roles'])
 def test_individual_session_settings(self):
  from hmi.session_settings import session_valid
  admin=self.access.save_user({'username':'Admin','password':'test-password-123'},setup=True)
  viewer=self.access.save_user({'username':'Viewer','password':'viewer-password-123','session_settings':{'mode':'never','hours':8}})
  self.assertEqual(self.access.public(admin)['session_settings']['mode'],'fixed')
  self.assertEqual(self.access.public(viewer)['session_settings']['mode'],'never')
  record={'created':0,'activity':3500}
  self.assertTrue(session_valid(record,self.access.public(viewer)['session_settings'],40000))
  self.assertFalse(session_valid(record,self.access.public(admin)['session_settings'],40000))
  with self.assertRaises(ValueError):self.access.save_user({'id':viewer['id'],'username':'Viewer','session_settings':{'mode':'invalid','hours':8}})
  self.assertEqual(self.access.public(self.access.login('Viewer','viewer-password-123'))['session_settings']['mode'],'never')
 def test_user_theme_isolated_and_validated(self):
  admin=self.access.save_user({'username':'Admin','password':'test-password-123'},setup=True)
  viewer=self.access.save_user({'username':'Viewer','password':'viewer-password-123'})
  self.assertEqual(self.access.public(viewer)['theme'],'system')
  self.access.preferences(viewer['id'],{'theme':'dark','administrator':True,'roles':['fake'],'id':admin['id']})
  saved=next(u for u in self.access.users() if u['id']==viewer['id'])
  self.assertEqual(saved['theme'],'dark');self.assertFalse(saved['administrator']);self.assertEqual(saved['roles'],[])
  self.assertEqual(next(u for u in self.access.users() if u['id']==admin['id'])['theme'],'system')
  with self.assertRaises(ValueError):self.access.preferences(viewer['id'],{'theme':'invalid'})
  self.access.save_user({'id':viewer['id'],'username':'Viewer','theme':'system'})
  self.assertEqual(self.access.public(self.access.login('Viewer','viewer-password-123'))['theme'],'system')
 def test_system_default_upgrade_applies_only_once(self):
  admin=self.access.save_user({'username':'Admin','password':'test-password-123','theme':'dark'},setup=True)
  self.service.store.set('system_theme_default_applied',False)
  upgraded=Access(self.service);self.assertEqual(upgraded.public(upgraded.users()[0])['theme'],'system')
  upgraded.preferences(admin['id'],{'theme':'dark'})
  self.assertEqual(Access(self.service).public(upgraded.users()[0])['theme'],'dark')
 def test_legacy_login_and_last_admin(self):
  salt='ab'*16;self.service.store.set('account',{'username':'Legacy','salt':salt,'hash':password_hash('test-password-123',salt)});self.service.store.delete('users') if hasattr(self.service.store,'delete') else self.service.store.set('users',None)
  access=Access(self.service);admin=access.login('Legacy','test-password-123');self.assertTrue(admin['administrator']);self.assertNotIn('hash',access.public(admin))
  with self.assertRaises(ValueError):access.save_user({'id':admin['id'],'username':'Legacy','administrator':False})
  with self.assertRaises(ValueError):access.remove_user(admin['id'],admin)
 def test_roles_and_canonical_actions(self):
  admin=self.access.save_user({'username':'Admin','password':'test-password-123'},setup=True)
  r1=self.access.save_role({'name':'Operator'});r2=self.access.save_role({'name':'Supervisor'})
  user=self.access.save_user({'username':'Viewer','password':'viewer-password-123','roles':[r1['id']]})
  page=self.service.pages()[0];page['actions']=[{'id':'a','action':'set','tag':'target','value':5,'requiredRoles':[r1['id'],r2['id']]}];self.service.store.set('pages',[page])
  request={'_access':{'page':page['id'],'control':'@page','action':'a'},'value':999,'tag':'tampered','requiredRoles':[]}
  with self.assertRaises(PermissionError):self.access.authorize(user,request)
  user=self.access.save_user({'id':user['id'],'username':'Viewer','roles':[r1['id'],r2['id']]})
  result=self.access.authorize(user,request);self.assertEqual(result['value'],5);self.assertEqual(result['tag'],'target')
  self.assertEqual(self.access.authorize(admin,request)['value'],5)
  self.access.save_role({'id':r1['id'],'name':'Renamed'});self.assertEqual(self.access.authorize(user,request)['value'],5)
  with self.assertRaises(ValueError):self.access.remove_role(r1['id'])
  record={'user_id':user['id'],'revision':user['revision']};self.assertIsNotNone(self.access.current(record))
  self.access.remove_user(user['id'],admin);self.assertIsNone(self.access.current(record))
 def test_kiosk_settings_and_last_management_admin(self):
  admin=self.access.save_user({'username':'Admin','password':'test-password-123'},setup=True)
  page=self.service.pages()[0]
  kiosk=self.access.save_user({'username':'Kiosk','password':'kiosk-password-123','kiosk':True,'starting_page':page['id']})
  public=self.access.public(kiosk);self.assertTrue(public['kiosk']);self.assertEqual(public['starting_page'],page['id'])
  with self.assertRaises(ValueError):self.access.save_user({'id':admin['id'],'username':'Admin','administrator':True,'kiosk':True})
  with self.assertRaises(ValueError):self.access.save_user({'id':kiosk['id'],'username':'Kiosk','starting_page':'missing'})
  legacy={**admin};legacy.pop('kiosk',None);legacy.pop('starting_page',None)
  self.assertFalse(self.access.public(legacy)['kiosk']);self.assertEqual(self.access.public(legacy)['starting_page'],'')
 def test_listbox_role_reference_and_administrator_bypass(self):
  role=self.access.save_role({'name':'Select Index'})
  page=self.service.pages()[0];page['controls']=[{'id':'list','type':'listbox','touchable':True,'elements':['One','Two'],'binding':{'tag':'t'},'requiredRoles':[role['id']]}];self.service.store.set('pages',[page])
  data={'page':page['id'],'control':'list','value':2}
  with self.assertRaises(PermissionError):self.access.listbox_action({'administrator':False,'roles':[]},data)
  self.assertEqual(self.access.listbox_action({'administrator':True,'roles':[]},data)['value'],2)
  with self.assertRaises(ValueError):self.access.remove_role(role['id'])
 def test_http_viewer_cannot_bypass_permissions(self):
  handler=make_handler(self.service)
  def request(path,data=None,cookie='',csrf=''):
   body=json.dumps(data).encode() if data is not None else b'';method='POST' if data is not None else 'GET'
   raw=(f'{method} {path} HTTP/1.0\r\nContent-Length: {len(body)}\r\nContent-Type: application/json\r\nCookie: {cookie}\r\nX-CSRF-Token: {csrf}\r\n\r\n').encode()+body
   class Socket:
    def __init__(self):self.output=io.BytesIO()
    def makefile(self,*args):return io.BytesIO(raw)
    def sendall(self,value):self.output.write(value)
   sock=Socket();handler(sock,('127.0.0.1',12345),SimpleNamespace());head,body=sock.output.getvalue().split(b'\r\n\r\n',1);lines=head.decode().split('\r\n');headers=dict(line.split(': ',1) for line in lines[1:]);return int(lines[0].split()[1]),json.loads(body),headers
  def login(name,password):
   code,_,headers=request('/api/login',{'username':name,'password':password});self.assertEqual(code,200);cookie=headers['Set-Cookie'].split(';')[0];status=request('/api/status',cookie=cookie)[1];return cookie,status['csrf']
  request('/api/setup',{'username':'Admin','password':'test-password-123','safety_acknowledged':True});admin_cookie,admin_csrf=login('Admin','test-password-123')
  import base64
  from hmi.symbols import prepare_symbol
  symbol={'name':'margin.svg','data':base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="30" width="40" height="50"/></svg>').decode(),'symbol':True,'prepare_only':True}
  code,prepared,_=request('/api/images',symbol,admin_cookie,admin_csrf)
  self.assertEqual(code,200);self.assertEqual(prepared['symbol']['tag'],'svg')
  self.assertIsNone(self.service.store.get('image:'+prepare_symbol(symbol)['id']))
  request('/api/admin/users/save',{'username':'Viewer','password':'viewer-password-123'},admin_cookie,admin_csrf)
  cookie,csrf=login('Viewer','viewer-password-123')
  self.assertEqual(request('/api/user/preferences',{'theme':'dark','administrator':True},cookie,csrf)[0],200)
  self.assertEqual(request('/api/status',cookie=cookie)[1]['user']['theme'],'dark')
  self.assertEqual(request('/api/session/kiosk/exit',{},cookie,csrf)[0],403)
  self.assertEqual(request('/api/admin/users',cookie=cookie)[0],403)
  self.assertEqual(request('/api/sources/status',cookie=cookie)[0],403)
  self.assertEqual(request('/api/images',symbol,cookie,csrf)[0],403)
  self.assertEqual(request('/api/pages/add',{'name':'Exploit'},cookie,csrf)[0],403)
  self.assertEqual(request('/api/admin/users/save',{'username':'Exploit','administrator':True},cookie,csrf)[0],403)
  self.assertEqual(request('/api/action',{'action':'set','tag':'x','value':99},cookie,csrf)[0],403)
  self.service.add_source({'id':'m','name':'Memory','kind':'memory'});self.service.add_tag({'id':'t','name':'Target','source':'m'})
  role=self.access.save_role({'name':'Operator'});page=self.service.pages()[0];page['actions']=[{'id':'allowed','action':'set','tag':'t','value':7,'requiredRoles':[role['id']]}];self.service.store.set('pages',[page])
  data={'_access':{'page':page['id'],'control':'@page','action':'allowed'},'value':999,'requiredRoles':[]}
  self.assertEqual(request('/api/action',data,cookie,csrf)[0],403)
  user=next(u for u in self.access.users() if u['username']=='Viewer');self.access.save_user({'id':user['id'],'username':'Viewer','roles':[role['id']]})
  self.assertEqual(request('/api/action',data,cookie,csrf)[1]['value'],7)
  page['controls']=[{'id':'list','type':'listbox','touchable':True,'binding':{'tag':'t'},'elements':['One','Two'],'requiredRoles':[role['id']]}];self.service.store.set('pages',[page])
  list_request={'page':page['id'],'control':'list','value':2,'requiredRoles':[]}
  self.assertEqual(request('/api/actions/listbox',list_request,cookie,csrf)[1]['value'],2)
  self.access.save_user({'id':user['id'],'username':'Viewer','roles':[]})
  self.assertEqual(request('/api/actions/listbox',{**list_request,'value':1},cookie,csrf)[0],403)
  self.assertEqual(request('/api/values',cookie=cookie)[1]['t']['value'],2)
  self.access.remove_user(user['id'],self.access.login('Admin','test-password-123'));self.assertEqual(request('/api/tags',cookie=cookie)[0],401)
  self.access.save_user({'username':'KioskAdmin','password':'kiosk-password-123','administrator':True,'kiosk':True,'starting_page':page['id']})
  cookie,csrf=login('KioskAdmin','kiosk-password-123')
  self.assertEqual(request('/api/admin/users',cookie=cookie)[0],403)
  self.assertEqual(request('/api/sources/status',cookie=cookie)[0],403)
  self.assertEqual(request('/api/pages/add',{'name':'Bypass'},cookie,csrf)[0],403)
  self.assertEqual(request('/api/page',cookie=cookie)[0],403)
  self.assertEqual(request('/api/action',{'action':'set','tag':'t','value':99},cookie,csrf)[0],403)
  self.assertEqual(request('/api/action',data,cookie,csrf)[1]['value'],7)
  self.assertEqual(request('/api/pages',cookie=cookie)[0],200)


  self.assertEqual(request('/api/session/kiosk/exit',{},cookie,csrf)[0],200)
  self.assertFalse(request('/api/status',cookie=cookie)[1]['user']['kiosk'])
  self.assertEqual(request('/api/admin/users',cookie=cookie)[0],200)
  self.assertTrue(next(u for u in self.access.users() if u['username']=='KioskAdmin')['kiosk'])
  cookie,csrf=login('KioskAdmin','kiosk-password-123')
  self.assertTrue(request('/api/status',cookie=cookie)[1]['user']['kiosk'])
