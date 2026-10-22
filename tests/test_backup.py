import base64,io,json,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from zipfile import ZipFile,ZIP_DEFLATED
from hmi.backup import export_backup,stage_restore,apply_pending,pending_path
from hmi.store import Store
from hmi.service import Service
from hmi.access import Access
from tests.http_helpers import make_handler

class BackupTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.directory=self.root/'data'
  self.service=Service(Store(self.directory/'hmi.sqlite3'));self.access=Access(self.service)
  self.access.save_user({'username':'Admin','password':'backup-test-123'},setup=True)
 def tearDown(self):
  for driver in self.service.drivers.values():driver.close()
  self.temp.cleanup()
 def test_round_trip_keeps_assets_users_sheets_databases_and_previous_data(self):
  self.service.store.set('image:test',{'data':'image bytes'})
  self.service.add_source({'id':'db','name':'Persistent','kind':'database','settings':{'filename':'test.sqlite3'}})
  self.service.drivers['db'].write('value',42)
  sheets=self.directory/'sheets';sheets.mkdir();(sheets/'test.sheet.json').write_text('{"version":1,"cells":{}}')
  backup=export_backup(self.service)
  self.service.store.set('image:test',{'data':'changed'})
  self.service.drivers['db'].write('value',99)
  self.assertTrue(stage_restore(self.directory,backup)['restart_required'])
  self.assertEqual(self.service.store.get('image:test')['data'],'changed')
  apply_pending(self.directory)
  restored=Service(Store(self.directory/'hmi.sqlite3'))
  try:
   self.assertEqual(restored.store.get('image:test')['data'],'image bytes')
   self.assertEqual(restored.drivers['db'].read('value'),42)
   self.assertIsNotNone(Access(restored).login('Admin','backup-test-123'))
   self.assertTrue((self.directory/'sheets'/'test.sheet.json').exists())
   self.assertFalse(pending_path(self.directory).exists())
   previous=list(self.root.glob('data-before-restore-*'));self.assertEqual(len(previous),1)
   self.assertEqual(Store(previous[0]/'hmi.sqlite3').get('image:test')['data'],'changed')
  finally:
   for driver in restored.drivers.values():driver.close()
 def test_invalid_archive_does_not_stage_or_change_data(self):
  for data in ['not base64',base64.b64encode(b'not a zip').decode()]:
   with self.assertRaises(ValueError):stage_restore(self.directory,{'data':data})
  original=base64.b64decode(export_backup(self.service)['data'])
  for corruption in ('checksum','path'):
   output=io.BytesIO()
   with ZipFile(io.BytesIO(original)) as src,ZipFile(output,'w',ZIP_DEFLATED) as dst:
    for name in src.namelist():
     content=src.read(name)
     if corruption=='checksum' and name=='hmi.sqlite3':content=b'damaged'
     dst.writestr(name,content)
    if corruption=='path':dst.writestr('../outside','bad')
   with self.assertRaises(ValueError):stage_restore(self.directory,{'data':base64.b64encode(output.getvalue()).decode()})
  self.assertFalse(pending_path(self.directory).exists())
  self.assertIsNotNone(self.access.login('Admin','backup-test-123'))
 def test_new_extension_and_legacy_pending_restore(self):
  backup=export_backup(self.service)
  self.assertTrue(backup['filename'].endswith('.oab-backup'))
  stage_restore(self.directory,backup)
  pending=pending_path(self.directory)
  self.assertEqual(pending.name,'data.restore.oab-backup')
  legacy=self.directory.with_name('data.restore.zip');pending.rename(legacy)
  self.assertEqual(pending_path(self.directory),legacy)
  apply_pending(self.directory)
  self.assertFalse(legacy.exists())
  restored=Service(Store(self.directory/'hmi.sqlite3'))
  try:self.assertIsNotNone(Access(restored).login('Admin','backup-test-123'))
  finally:
   for driver in restored.drivers.values():driver.close()
 def test_staging_new_restore_replaces_legacy_pending(self):
  backup=export_backup(self.service)
  legacy=self.directory.with_name('data.restore.zip');legacy.write_bytes(b'old pending restore')
  stage_restore(self.directory,backup)
  self.assertEqual(pending_path(self.directory).name,'data.restore.oab-backup')
  self.assertFalse(legacy.exists())
 def test_http_authorization_and_first_run_restore(self):
  handler=make_handler(self.service)
  def request(path,data=None,cookie='',csrf='',origin=''):
   body=json.dumps(data).encode() if data is not None else b''
   raw=(('POST' if data is not None else 'GET')+' '+path+' HTTP/1.0\r\n'+f'Host: localhost\r\nCookie: {cookie}\r\nX-CSRF-Token: {csrf}\r\n'+(f'Origin: {origin}\r\n' if origin else '')+f'Content-Length: {len(body)}\r\n\r\n').encode()+body
   class Socket:
    def __init__(self):self.output=io.BytesIO()
    def makefile(self,*args):return io.BytesIO(raw)
    def sendall(self,value):self.output.write(value)
   sock=Socket();handler(sock,('127.0.0.1',1),SimpleNamespace())
   head,body=sock.output.getvalue().split(b'\r\n\r\n',1);lines=head.decode().split('\r\n');headers=dict(line.split(': ',1) for line in lines[1:])
   return int(lines[0].split()[1]),json.loads(body),headers.get('Set-Cookie','')
  self.assertEqual(request('/api/admin/backup',{})[0],401)
  _,_,cookie=request('/api/login',{'username':'Admin','password':'backup-test-123'})
  csrf=request('/api/status',cookie=cookie)[1]['csrf']
  self.assertEqual(request('/api/admin/backup',{},cookie)[0],403)
  status,backup,_=request('/api/admin/backup',{},cookie,csrf);self.assertEqual(status,200,backup)
  self.assertEqual(request('/api/setup/restore',backup)[0],409)
  request('/api/admin/users/save',{'username':'Operator','password':'backup-test-123'},cookie,csrf)
  _,_,operator=request('/api/login',{'username':'Operator','password':'backup-test-123'})
  token=request('/api/status',cookie=operator)[1]['csrf']
  self.assertEqual(request('/api/admin/backup',{},operator,token)[0],403)
  self.assertEqual(request('/api/admin/restore',backup,operator,token)[0],403)
  self.assertEqual(request('/api/admin/restore',backup,cookie,csrf)[0],200)
  self.service.store.set('users',[])
  self.assertEqual(request('/api/setup/restore',backup)[0],400)
  self.assertEqual(request('/api/setup/restore',{**backup,'safety_acknowledged':True},origin='http://evil.example')[0],403)
  self.assertEqual(request('/api/setup/restore',{**backup,'safety_acknowledged':True})[0],200)
