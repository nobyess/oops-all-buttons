import tempfile
import unittest
from pathlib import Path
from hmi.store import Store
from hmi.service import Service
from hmi.page_transfer import export_page, import_page
from hmi.images import prepare_image

class PageTransferTests(unittest.TestCase):
    def test_roundtrip_new_ids_named_bindings_parameters_destinations_images(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            service=Service(Store(Path(folder)/'test.sqlite3'))
            service.add_source({'id':'mem','name':'Memory','kind':'memory'})
            service.add_tag({'id':'old-tag','name':'Value','source':'mem'})
            dest=service.add_page({'name':'Destination'});dest['parameters']=[{'id':'parameter:dest','name':'Input','description':''}];service.save_page(dest)
            page=service.pages()[0];page['name']='Export Test';page['parameters']=[{'id':'parameter:local','name':'Value','description':'Test parameter'}]
            image=prepare_image({'name':'test.svg','data':'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg=='})
            service.store.set('image:'+image['id'],image)
            page['controls']=[{'id':'numeric','type':'numeric','binding':{'tag':'old-tag'}},
                {'id':'label','type':'label','text':r'Value @{Memory\Value}','actions':[{'id':'self','action':'popup','page':page['id'],'parameters':{'parameter:local':'old-tag'}},{'id':'dest','action':'navigate','page':dest['id'],'parameters':{'parameter:dest':'parameter:local'}}]},
                {'id':'image','type':'image','image':'/api/images/'+image['id']}]
            service.save_page(page);payload=export_page(service,{'id':page['id']});before=service.pages()
            result=import_page(service,{'page':payload,'name':'Copy'});copy=next(p for p in service.pages() if p['id']==result['id'])
            self.assertEqual(len(service.pages()),len(before)+1);self.assertEqual(service.pages()[:-1],before)
            self.assertNotEqual(copy['id'],page['id']);self.assertEqual(copy['controls'][0]['binding']['tag'],'old-tag')
            self.assertTrue(all(a['id']!=b['id'] for a,b in zip(copy['controls'],page['controls'])))
            local=copy['parameters'][0]['id'];self.assertNotEqual(local,'parameter:local')
            actions=copy['controls'][1]['actions'];self.assertEqual(actions[0]['page'],copy['id']);self.assertEqual(actions[0]['parameters'],{local:'old-tag'})
            self.assertEqual(actions[1]['parameters'],{'parameter:dest':local});self.assertEqual(copy['controls'][1]['textRefs'][r'Memory\Value'],'old-tag')
            self.assertEqual(copy['controls'][2]['image'],page['controls'][2]['image'])
            # Re-import into a separate database with different external tag/page IDs.
            other=Service(Store(Path(folder)/'other.sqlite3'));other.add_source({'id':'newmem','name':'Memory','kind':'memory'});other.add_tag({'id':'newtag','name':'Value','source':'newmem'})
            newdest=other.add_page({'name':'Destination'});newdest['parameters']=[{'id':'parameter:newdest','name':'Input'}];other.save_page(newdest)
            result=import_page(other,{'page':payload,'name':'Portable'});copied=next(p for p in other.pages() if p['id']==result['id'])
            self.assertEqual(copied['controls'][0]['binding']['tag'],'newtag');self.assertEqual(copied['controls'][1]['actions'][1]['page'],newdest['id'])
            self.assertIn('parameter:newdest',copied['controls'][1]['actions'][1]['parameters'])

    def test_missing_dependencies_and_malformed_layout_do_not_create_pages(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            service=Service(Store(Path(folder)/'test.sqlite3'));before=service.pages()
            payload={'format':'python-hmi-page','version':1,'page':{'id':'old','name':'Test','controls':[{'id':'label','binding':{'tag':'missing'}}]},'tags':{'missing':r'Memory\Missing'}}
            with self.assertRaisesRegex(ValueError,'Missing referenced tag'):import_page(service,{'page':payload})
            self.assertEqual(service.pages(),before)
            payload['page']['controls']=[];payload['page']['width']=-1
            with self.assertRaises(ValueError):import_page(service,{'page':payload})
            self.assertEqual(service.pages(),before)
