import base64
import io
import json
import tempfile
import shutil
from unittest.mock import patch
from hmi.builtin_assets import BuiltinAssets, authoring_enabled
import unittest
from pathlib import Path
from types import SimpleNamespace
from hmi.service import Service
from hmi.store import Store
from hmi.access import Access
from hmi.assets import asset_identity
from hmi.images import prepare_image
from hmi.backup import export_backup, stage_restore, apply_pending
from hmi.page_transfer import export_page, import_page
from run import make_handler

SVG = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'


class AssetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name) / 'data'
        self.service = Service(Store(self.directory / 'hmi.sqlite3'))
        Access(self.service).save_user({'username': 'Admin', 'password': 'asset-test-123'}, setup=True)
        self.handler = make_handler(self.service)

    def tearDown(self):
        for driver in self.service.drivers.values():
            driver.close()
        self.temp.cleanup()

    def save(self, kind='image', raw=SVG, filename='drawing.svg', **extra):
        return self.service.assets.save({'kind': kind, 'name': 'Drawing', 'category': 'Equipment', 'filename': filename, 'data': base64.b64encode(raw).decode(), **extra})

    def request(self, path, data=None, cookie='', csrf='', headers=''):
        body = json.dumps(data).encode() if data is not None else b''
        raw = (('POST' if data is not None else 'GET') + ' ' + path + ' HTTP/1.0\r\nHost: localhost\r\n' + f'Cookie: {cookie}\r\nX-CSRF-Token: {csrf}\r\nContent-Length: {len(body)}\r\n' + headers + '\r\n').encode() + body
        class Socket:
            def __init__(self): self.output = io.BytesIO()
            def makefile(self, *args): return io.BytesIO(raw)
            def sendall(self, value): self.output.write(value)
        sock = Socket()
        self.handler(sock, ('127.0.0.1', 1), SimpleNamespace())
        head, response = sock.output.getvalue().split(b'\r\n\r\n', 1)
        lines = head.decode().split('\r\n')
        response_headers = dict(line.split(': ', 1) for line in lines[1:])
        return int(lines[0].split()[1]), response, response_headers

    def login(self, username='Admin'):
        _, _, headers = self.request('/api/login', {'username': username, 'password': 'asset-test-123'})
        cookie = headers['Set-Cookie']
        csrf = json.loads(self.request('/api/status', cookie=cookie)[1])['csrf']
        return cookie, csrf

    def test_catalog_is_metadata_only_and_legacy_images_keep_urls(self):
        legacy = prepare_image({'name': 'Legacy', 'data': base64.b64encode(SVG).decode()})
        self.service.store.set('image:' + legacy['id'], legacy)
        catalog = self.service.assets.catalog()
        self.assertEqual(catalog[0]['id'], legacy['id'])
        self.assertNotIn('data', catalog[0])
        self.assertNotIn('blob', catalog[0])
        self.assertEqual(self.service.assets.image(legacy['id'])['data'], legacy['data'])
        self.assertEqual(asset_identity(catalog[0]['url']), legacy['id'])

    def test_button_artwork_references_replacement_and_page_roundtrip(self):
        for kind in ('image','symbol'):
            with self.subTest(kind=kind):
                asset=self.save(kind=kind)
                page=self.service.pages()[0]
                page['controls']=[{'id':'art-button','type':'button','text':'Start','buttonDisplay':'both','buttonArtworkKind':kind,'image':asset['url'],'imageName':asset['name']}]
                self.service.save_page(page)
                self.assertTrue(self.service.assets.references(asset['id']))
                with self.assertRaises(ValueError):self.service.assets.remove(asset['id'])
                self.service.assets.save({'id':asset['id'],'name':'Updated','category':'Equipment'})
                saved=self.service.pages()[0]
                self.assertEqual(saved['controls'][0]['imageName'],'Updated')
                exported=export_page(self.service,{'id':saved['id']})
                imported=import_page(self.service,{'page':exported,'name':'Imported '+kind})
                control=next(p for p in self.service.pages() if p['id']==imported['id'])['controls'][0]
                self.assertEqual(control['buttonArtworkKind'],kind)
                if kind=='symbol':self.assertIsNotNone(self.service.store.get('image:'+asset_identity(control['image'])).get('symbol'))

    def test_replacement_preserves_identity_updates_references_and_prevents_delete(self):
        asset = self.save('symbol')
        self.service.store.set('pages', [{'id': 'main', 'name': 'Main', 'controls': [{'id': 'valve', 'name': 'Valve', 'type': 'symbol', 'image': asset['url']}]}])
        updated = self.save('symbol', SVG.replace(b'10', b'20'), id=asset['id'])
        self.assertEqual(updated['id'], asset['id'])
        self.assertNotEqual(updated['url'], asset['url'])
        self.assertEqual(self.service.pages()[0]['controls'][0]['image'], updated['url'])
        self.assertEqual(self.service.assets.catalog()[0]['references'][0]['name'], 'Main\\Valve')
        with self.assertRaisesRegex(ValueError, 'references'):
            self.service.assets.remove(asset['id'])
        self.service.store.set('pages', [])
        self.service.assets.remove(asset['id'])
        self.assertEqual(self.service.assets.catalog(), [])
        self.assertFalse(list(self.service.assets.directory.iterdir()))

    def test_content_type_is_checked_on_page_save(self):
        asset = self.save('image')
        with self.assertRaisesRegex(ValueError, 'type'):
            self.service.validate_controls([{'id': 's', 'type': 'symbol', 'image': asset['url']}])

    def test_movie_ranges_text_safety_and_access(self):
        movie = self.save('movie', b'\x00\x00\x00\x18ftypisom0123456789', 'movie.mp4')
        text = self.save('text', b'<script>not executable</script>', 'notes.txt')
        self.assertEqual(self.request(movie['url'])[0], 401)
        cookie, csrf = self.login()
        code, content, headers = self.request(movie['url'], cookie=cookie, headers='Range: bytes=4-7\r\n')
        self.assertEqual((code, content), (206, b'ftyp'))
        self.assertEqual(headers['Content-Range'], 'bytes 4-7/22')
        self.assertEqual(self.request(movie['url'], cookie=cookie, headers='Range: bytes=999-\r\n')[0], 416)
        self.assertEqual(self.request(movie['url'], cookie=cookie, headers='Range: bytes=-4\r\n')[1], b'6789')
        _, _, headers = self.request(text['url'], cookie=cookie)
        self.assertEqual(headers['Content-Type'], 'text/plain; charset=utf-8')
        self.assertIn('sandbox', headers['Content-Security-Policy'])
        self.assertEqual(self.request('/api/assets/remove', {'id': text['id']}, cookie)[0], 403)
        Access(self.service).save_user({'username': 'Operator', 'password': 'asset-test-123'})
        operator, token = self.login('Operator')
        self.assertEqual(self.request('/api/assets', cookie=operator)[0], 403)
        self.assertEqual(self.request('/api/assets/remove', {'id': text['id']}, operator, token)[0], 403)
        self.assertEqual(self.request(text['url'], cookie=operator)[0], 200)

    def test_backup_restore_and_page_export_include_asset_bytes(self):
        asset = self.save()
        self.service.store.set('pages', [{'id': 'main', 'name': 'Main', 'controls': [{'id': 'i', 'type': 'image', 'image': asset['url']}]}])
        exported = export_page(self.service, {'id': 'main'})
        self.assertEqual(base64.b64decode(exported['images'][asset['url']]['data']), SVG)
        backup = export_backup(self.service)
        self.service.assets.blob_path(self.service.assets.get(asset['id'])).write_bytes(b'changed')
        stage_restore(self.directory, backup)
        apply_pending(self.directory)
        self.assertEqual(base64.b64decode(self.service.assets.image(asset['id'])['data']), SVG)

    def test_builtin_is_copied_and_logo_reference_protects_removal(self):
        builtin = next(i for i in self.service.assets.catalog(True) if i.get('builtin'))
        copied = self.service.assets.import_builtin(builtin['id'])
        self.assertEqual(copied['kind'], 'symbol')
        self.assertEqual(self.service.assets.import_builtin(builtin['id'])['id'],copied['id'])
        self.assertFalse(any(item['id']==builtin['id'] for item in self.service.assets.catalog(True)))
        self.assertTrue(self.service.assets.image(copied['id'])['symbol'])
        image = self.save()
        cookie, csrf = self.login()
        self.assertEqual(self.request('/api/admin/site', {'asset_id': image['id']}, cookie, csrf)[0], 200)
        self.assertEqual(self.request('/api/site/logo')[1], SVG)
        with self.assertRaisesRegex(ValueError, 'references'):
            self.service.assets.remove(image['id'])

    def test_invalid_files_and_blank_metadata_are_rejected(self):
        for kind, raw, filename in [('movie', SVG, 'movie.mp4'), ('text', b'\xff', 'notes.txt'), ('text', b'hi', 'page.html'), ('symbol', b'no svg', 'bad.svg')]:
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                self.save(kind, raw, filename)
        with self.assertRaises(ValueError): self.save(name=' ')
        with self.assertRaises(ValueError): self.save(category=' ')

    def test_symbol_page_import_keeps_symbol_type_and_recoloring(self):
        asset=self.save('symbol')
        page=self.service.pages()[0]
        page['controls']=[{'id':'valve','type':'symbol','image':asset['url']}]
        self.service.save_page(page)
        payload=export_page(self.service,{'id':page['id']})
        result=import_page(self.service,{'page':payload,'name':'Copied'})
        self.service.assets.catalog()
        copied=next(page for page in self.service.pages() if page['id']==result['id'])
        identity=asset_identity(copied['controls'][0]['image'])
        self.assertEqual(self.service.assets.get(identity)['kind'],'symbol')
        self.service.save_page(copied)

    def isolate_builtins(self):
        root=Path(self.temp.name)/'builtins'
        shutil.copytree(self.service.assets.builtins,root/'symbols')
        self.service.assets.builtins=root/'symbols'
        self.service.assets.builtin_assets=BuiltinAssets(root/'assets')
        return root

    def test_promote_all_types_and_reimport_without_changing_project(self):
        self.isolate_builtins()
        cases=[('image',SVG,'image.svg'),('symbol',SVG,'symbol.svg'),('text',b'Operator notes','notes.txt'),('movie',b'\x00\x00\x00\x18ftypisom0123456789','movie.mp4')]
        for kind,raw,filename in cases:
            with self.subTest(kind=kind):
                asset=self.save(kind,raw,filename)
                promoted=self.service.assets.promote({'id':asset['id'],'name':'Built-in '+kind,'category':'Defaults'})
                self.assertTrue(promoted['id'].startswith('builtin:asset:'))
                self.assertTrue(self.service.assets.blob_path(self.service.assets.get(asset['id'])).is_file())
                self.assertEqual(self.service.assets.get(asset['id'])['name'],'Drawing')
                reused=self.service.assets.promote({'id':asset['id']})
                self.assertTrue(reused['reused'])
                copied=self.service.assets.import_builtin(promoted['id'])
                self.assertEqual(copied['id'],asset['id'])
                self.assertEqual(copied['kind'],kind)
        self.assertEqual(len(self.service.assets.builtin_assets.entries()),4)

    def test_update_existing_builtin_is_stable_and_atomic_catalog_is_valid(self):
        self.isolate_builtins()
        asset=self.save('text',b'first','notes.txt')
        original=self.service.assets.promote({'id':asset['id']})
        self.save('text',b'second','notes.txt',id=asset['id'])
        updated=self.service.assets.promote({'id':asset['id'],'target':original['id'],'name':'New name','category':'Operations'})
        self.assertEqual(original['id'],updated['id'])
        self.assertEqual(len(self.service.assets.builtin_assets.entries()),1)
        entry,raw=self.service.assets.builtin_assets.read(updated['id'])
        self.assertEqual(raw,b'second');self.assertEqual(entry['category'],'Operations')
        self.assertFalse(list(self.service.assets.builtin_assets.root.rglob('*.tmp')))

    def test_update_legacy_builtin_and_keep_saved_control_reference(self):
        self.isolate_builtins()
        target=next(item for item in self.service.assets.catalog(True,True) if item.get('builtin'))
        asset=self.save('symbol')
        self.service.store.set('pages',[{'id':'main','name':'Main','controls':[{'id':'valve','image':asset['url']}]}])
        result=self.service.assets.promote({'id':asset['id'],'target':target['id'],'name':'Updated valve','category':'Valves'})
        self.assertEqual(result['id'],target['id'])
        self.assertEqual(self.service.pages()[0]['controls'][0]['image'],asset['url'])
        catalog=self.service.assets.catalog(True,True)
        self.assertEqual(next(item for item in catalog if item['id']==target['id'])['name'],'Updated valve')

    def test_portable_hides_capability_and_rejects_promotion(self):
        root=self.isolate_builtins()
        asset=self.save()
        cookie,csrf=self.login()
        with patch('sys.frozen',True,create=True):
            self.assertFalse(authoring_enabled())
            code,body,_=self.request('/api/admin/assets/capabilities',cookie=cookie)
            self.assertEqual(code,200);self.assertFalse(json.loads(body)['can_promote'])
            self.assertEqual(self.request('/api/assets/promote',{'id':asset['id']},cookie,csrf)[0],403)
            with self.assertRaisesRegex(ValueError,'portable'):self.service.assets.promote({'id':asset['id']})
        self.assertFalse((root/'assets').exists())

    def test_identical_builtin_file_reused_and_invalid_target_does_not_write(self):
        self.isolate_builtins()
        a=self.save('text',b'notes','notes.txt')
        first=self.service.assets.promote({'id':a['id']})
        b=self.save('text',b'notes','other.txt')
        same=self.service.assets.promote({'id':b['id']})
        self.assertTrue(same['reused']);self.assertEqual(first['id'],same['id'])
        with self.assertRaises(ValueError):self.service.assets.promote({'id':a['id'],'target':'builtin:asset:../outside'})
        self.assertEqual(len(self.service.assets.builtin_assets.entries()),1)
