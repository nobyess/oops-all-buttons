import tempfile
import unittest
from pathlib import Path
from hmi.service import Service
from hmi.store import Store
from hmi.access import Access
from hmi.starter_page import DEMO_TAGS
from hmi.backup import export_backup, stage_restore, apply_pending


class StarterPageTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.path=Path(self.temp.name)/'data'/'hmi.sqlite3'
        self.services=[]

    def tearDown(self):
        for service in self.services:
            for driver in service.drivers.values():driver.close()
        self.temp.cleanup()

    def open(self,path=None,**kwargs):
        service=Service(Store(path or self.path),initialize_starter=True,**kwargs)
        self.services.append(service)
        return service

    def test_fresh_project_has_editable_page_flat_tags_and_assets(self):
        service=self.open();page=service.pages()[0]
        self.assertEqual(page['name'],'Start Page')
        self.assertGreater(page['height'],2000)
        self.assertGreater(len(page['controls']),30)
        self.assertEqual({t['name'] for t in service.store.get('tags')},{name for _,name,_,_ in DEMO_TAGS})
        self.assertTrue(all(t['folder']=='Memory' and '\\' not in t['name'] for t in service.store.get('tags')))
        self.assertEqual(len(service.assets.records()),2)
        service.validate_controls(page['controls'])
        control=next(c for c in page['controls'] if c['id']=='start-level-input')
        self.assertEqual(list(control['textRefs'].values()),['demo-tank-level'])
        for asset in service.assets.records():self.assertTrue(service.assets.references(asset['id']))
        self.assertEqual(Access(service).users(),[],'First-run account setup is still required')
        page['name']='My welcome page';service.save_page(page)
        self.assertEqual(self.open().pages()[0]['name'],'My welcome page')

    def test_new_users_default_to_start_page_without_changing_existing_users(self):
        service=self.open();access=Access(service)
        admin=access.save_user({'username':'Admin','password':'starter-test-123'},setup=True)
        self.assertEqual(admin['starting_page'],'main')
        page=service.pages()[0];page['name']='Welcome';service.save_page(page)
        user=access.save_user({'username':'Viewer','password':'starter-test-123'})
        self.assertEqual(user['starting_page'],'main','Renaming the starter page keeps it as the new-user default')
        explicit=access.save_user({'username':'First','password':'starter-test-123','starting_page':''})
        self.assertEqual(explicit['starting_page'],'')
        access.save_user({'id':explicit['id'],'username':'First','theme':'dark'})
        self.assertEqual(access.login('First','starter-test-123')['starting_page'],'')
        service.remove_page({'id':'main'})
        other=access.save_user({'username':'AfterDelete','password':'starter-test-123'})
        self.assertEqual(other['starting_page'],'','Deleted start pages are never assigned')

    def test_memory_defaults_actions_and_restart(self):
        service=self.open();service.polling.poll_due(asynchronous=False)
        for identity,_,_,value in DEMO_TAGS:self.assertEqual(service.values({identity})[identity]['value'],value)
        service.act({'tag':'demo-tank-level','action':'set','value':100})
        self.assertEqual(service.values({'demo-tank-level'})['demo-tank-level']['value'],100)
        self.assertEqual(service.act({'tag':'demo-pump-enabled','action':'toggle'}),1)
        restarted=self.open();restarted.polling.poll_due(asynchronous=False)
        self.assertEqual(restarted.values({'demo-tank-level'})['demo-tank-level']['value'],65)
        self.assertEqual(restarted.values({'demo-pump-enabled'})['demo-pump-enabled']['value'],False)

    def test_deleting_page_tags_and_assets_does_not_reseed(self):
        service=self.open();service.remove_page({'id':'main'})
        for tag in list(service.store.get('tags')):service.remove_tag({'id':tag['id']})
        for asset in list(service.assets.records()):service.assets.remove(asset['id'])
        restarted=self.open()
        self.assertEqual(restarted.pages(),[])
        self.assertEqual(restarted.store.get('tags'),[])
        self.assertEqual(restarted.assets.records(),[])

    def test_existing_and_empty_projects_are_not_changed(self):
        for index,entries in enumerate(({'pages':[]},{'users':[]},{'page':{'controls':[]}},{'sources':[]},
                                      {'pages':[{'id':'custom','name':'Existing','controls':[]}]})):
            with self.subTest(entries=entries):
                path=self.path.parent/('legacy'+str(index)+'.sqlite3');store=Store(path);store.set_many(entries)
                service=self.open(path)
                self.assertFalse(service.store.get('starter_content_version'))
                self.assertEqual(service.store.get('tags'),[])
                self.assertEqual(service.assets.records(),[])
                if 'pages' in entries:self.assertEqual([p['id'] for p in service.pages()],[p['id'] for p in entries['pages']])

    def test_restored_project_is_preserved(self):
        service=self.open();page=service.pages()[0];page['name']='Restored custom start';service.save_page(page)
        Access(service).save_user({'username':'Admin','password':'starter-test-123'},setup=True)
        backup=export_backup(service)
        destination=self.path.parent/'restored'
        stage_restore(destination,backup);apply_pending(destination)
        restored=self.open(destination/'hmi.sqlite3')
        self.assertEqual(restored.pages()[0]['name'],'Restored custom start')
        self.assertEqual(len(restored.assets.records()),2)
        restored.remove_page({'id':'main'})
        self.assertEqual(self.open(destination/'hmi.sqlite3').pages(),[])


if __name__=='__main__':unittest.main()
