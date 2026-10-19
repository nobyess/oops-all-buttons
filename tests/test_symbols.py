import base64
import unittest
from hmi.symbols import prepare_symbol

class SymbolTests(unittest.TestCase):
    def symbol(self,text):
        return prepare_symbol({'name':'test.svg','data':base64.b64encode(text.encode()).decode()})
    def test_paint_css_inheritance_and_local_geometry(self):
        asset=self.symbol('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><style>.outline {fill:none;stroke:red;stroke-width:5}</style><g fill="none" stroke="blue"><path d="M0 0L10 10"/><rect class="outline" fill="pink" width="20" height="20"/></g></svg>')
        tree=asset['symbol'];self.assertEqual(tree['attributes']['viewBox'],'0 0 100.0 80.0')
        group=tree['children'][0];self.assertEqual(group['children'][0]['paint'],{'fill':False,'stroke':True});self.assertEqual(group['children'][1]['paint'],{'fill':False,'stroke':True})
        self.assertEqual(group['children'][1]['attributes']['stroke-width'],'5')
        rebuilt=prepare_symbol(asset);self.assertEqual(rebuilt['symbol'],tree)
    def test_active_content_external_references_and_styles_are_removed(self):
        asset=self.symbol('<svg xmlns="http://www.w3.org/2000/svg" onload="bad()"><script>bad()</script><foreignObject><div>bad</div></foreignObject><image href="https://example.com/x"/><path onclick="bad()" style="filter:url(https://example.com/filter);fill:red" d="M0 0L1 1"/><use href="https://example.com/a"/><defs><clipPath id="cut"><rect width="10" height="10"/></clipPath></defs><rect clip-path="url(#cut)" width="10" height="10"/></svg>')
        raw=base64.b64decode(asset['data']).decode()
        for forbidden in ('script','foreignObject','https://example','onload','onclick','filter='):
            self.assertNotIn(forbidden,raw)
        self.assertIn('url(#cut)',raw)
    def test_rejects_raster_and_declarations(self):
        for raw in [b'\x89PNG\r\n\x1a\n123',b'<!DOCTYPE svg><svg/>']:
            with self.assertRaises(ValueError):prepare_symbol({'data':base64.b64encode(raw).decode()})

    def test_page_export_import_preserves_symbol_asset(self):
        import tempfile
        from pathlib import Path
        from hmi.store import Store
        from hmi.service import Service
        from hmi.page_transfer import export_page, import_page
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            service=Service(Store(Path(folder)/'test.sqlite3'))
            asset=self.symbol('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="none" stroke="black" stroke-width="3" d="M0 0L20 20"/></svg>')
            service.store.set('image:'+asset['id'],asset)
            page=service.pages()[0];page['controls']=[{'id':'symbol','type':'symbol','image':'/api/images/'+asset['id'],'strokeWidth':4,'backColor':'#abcdef','foreColor':'#123456'}]
            service.save_page(page);payload=export_page(service,{'id':page['id']})
            result=import_page(service,{'page':payload,'name':'Symbol copy'})
            copy=next(p for p in service.pages() if p['id']==result['id'])['controls'][0]
            stored=service.store.get('image:'+copy['image'].rsplit('/',1)[-1])
            self.assertEqual(prepare_symbol(stored)['symbol']['children'][0]['paint'],{'fill':False,'stroke':True})
            self.assertEqual(copy['strokeWidth'],4);self.assertEqual(copy['foreColor'],'#123456')
    def test_forecolor_marker_survives_browser_serialization(self):
        asset=self.symbol('<svg xmlns="http://www.w3.org/2000/svg"><path fill="#123456" data-symbol-fill="true" data-symbol-fill-color="fore" d="M0 0L10 0L0 10Z"/><path fill="red" data-symbol-fill-color="invalid" d="M0 0L20 0L0 20Z"/></svg>')
        first,second=asset['symbol']['children']
        self.assertEqual(first['paint'],{'fill':True,'stroke':False,'fillColor':'fore'})
        self.assertNotIn('fillColor',second['paint'])
        self.assertNotIn('data-symbol-fill-color',second['attributes'])
        self.assertEqual(self.symbol(base64.b64decode(asset['data']).decode())['symbol'],asset['symbol'])
