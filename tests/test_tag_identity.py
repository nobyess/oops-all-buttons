import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from hmi.service import Service
from hmi.store import Store
from hmi.drivers import DRIVERS
from hmi.pycomm3_logix import PyComm3LogixDriver
from test_pycomm3 import FakePLC, SETTINGS

class TagIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.store=Store(Path(self.temp.name)/'hmi.sqlite3')
        self.service=Service(self.store)
        for source in ('A','B'):self.service.add_source({'id':source,'kind':'memory'})
    def tearDown(self):
        for driver in self.service.drivers.values():driver.close()
        self.temp.cleanup()
    def test_same_names_across_sources_and_memory_rename_preserve_references(self):
        for source in ('A','B'):self.service.add_tag({'name':'Counter','source':source,'address':'1'})
        a,b=[t for t in self.service.tags() if not t.get('builtin')]
        self.assertNotEqual(a['id'],b['id'])
        self.assertNotEqual(a['id'],'Counter')
        with self.assertRaises(ValueError):self.service.add_tag({'name':'counter','source':'A','address':'2'})
        page=self.service.pages()[0]
        page['controls']=[{'id':'display','type':'numeric','binding':{'tag':a['id']},
            'actions':[{'id':'action','tag':b['id'],'action':'set','value':3}],
            'events':[{'id':'event','tag':a['id'],'operator':'>','operand':{'kind':'tag','tag':b['id']},'action':'hide'}]}]
        self.service.save_page(page)
        saved=self.service.pages()
        self.service.act({'tag':a['id'],'action':'set','value':8})
        self.service.edit_tag({'id':a['id'],'name':'Renamed Counter'})
        self.assertEqual([t for t in self.service.tags() if not t.get('builtin')][0]['id'],a['id'])
        self.assertEqual(self.service.pages(),saved)
        self.assertEqual(self.service.values()[a['id']]['value'],8)
        self.assertEqual(self.service.usage(a['id'])[0]['tag'],r'A\Renamed Counter')
        self.assertEqual(self.service.tag_catalog()[0]['path'],r'A\Renamed Counter')
        self.assertEqual(self.service.tag_catalog()[1]['path'],r'B\Counter')
        with self.assertRaises(ValueError):self.service.remove_tag({'id':a['id']})
        restarted=Service(self.store)
        self.assertEqual(restarted.tags()[0]['name'],'Renamed Counter')
        self.assertEqual(restarted.pages(),saved)
        for driver in restarted.drivers.values():driver.close()
    def test_batch_only_returns_requested_source_tags_and_view_states(self):
        for source in ('A','B'):self.service.add_tag({'name':'Counter','source':source,'address':'1'})
        a,b=[t for t in self.service.tags() if not t.get('builtin')]
        self.service.act({'tag':a['id'],'action':'set','value':4})
        with patch.object(self.service.drivers['B'],'read',side_effect=AssertionError('Unsubscribed tag read')):
            result=self.service.batch_values({'source':'A','tags':[a['id'],b['id']],'pages':['main','missing']})
        self.assertEqual(set(result['values']),{a['id']})
        self.assertEqual(result['values'][a['id']]['value'],4)
        self.assertNotIn('controlStates',result)
        self.assertEqual(result['live'],0.5)
        self.assertNotIn('stateRevision',result)
        with self.assertRaises(ValueError):self.service.batch_values({'tags':'all'})
        with self.assertRaises(ValueError):self.service.batch_values({'source':'missing','tags':[]})

    def test_legacy_driver_key_migration_preserves_settings_and_tag_references(self):
        settings={**SETTINGS,'local_ip':'192.0.2.20','live':0.5,'background':20}
        self.store.set('sources',[{'id':'stable-source','name':'Existing PLC','kind':'allen_bradley','settings':settings}])
        self.store.set('tags',[{'id':'stable-tag','name':'Counter','source':'stable-source','address':'Counter','writable':True}])
        page=self.service.pages()[0]
        page['controls']=[{'id':'display','type':'numeric','binding':{'tag':'stable-tag'}}]
        self.service.save_page(page)
        before=self.service.pages()
        with patch.dict(DRIVERS,{'pycomm3':lambda settings:PyComm3LogixDriver(settings,FakePLC)}):
            migrated=Service(self.store)
        source=migrated.sources()[0]
        self.assertEqual(source['kind'],'pycomm3')
        self.assertEqual(source['id'],'stable-source')
        self.assertEqual(source['settings'],settings)
        self.assertEqual(migrated.tags()[0]['source'],'stable-source')
        self.assertEqual(migrated.pages(),before)
        for driver in migrated.drivers.values():driver.close()

    def test_legacy_migration_keeps_page_references(self):
        self.store.set('tags',[{'id':'Legacy','source':'A','address':'1','writable':True}])
        page=self.service.pages()[0]
        page['controls']=[{'id':'display','type':'numeric','binding':{'tag':'Legacy'}}]
        self.service.save_page(page)
        before=self.service.pages()
        migrated=Service(self.store)
        self.assertEqual(migrated.tags()[0]['id'],'Legacy')
        self.assertEqual(migrated.tags()[0]['name'],'Legacy')
        self.assertEqual(migrated.pages(),before)
        for driver in migrated.drivers.values():driver.close()
    def test_plc_names_are_fixed_and_slc_aliases_can_be_renamed(self):
        with patch.dict(DRIVERS,{'pycomm3':lambda settings:PyComm3LogixDriver(settings,FakePLC)}):
            for source,protocol in [('Logix','logix'),('SLC','slc')]:
                self.service.add_source({'id':source,'kind':'pycomm3','settings':{**SETTINGS,'protocol':protocol}})
                self.service.add_tag({'name':'Alias','source':source,'address':'Counter'})
            logix,slc=[t for t in self.service.tags() if not t.get('builtin')]
            self.assertEqual(logix['name'],'Counter')
            with self.assertRaises(ValueError):self.service.edit_tag({'id':logix['id'],'name':'Wrong'})
            self.service.edit_tag({'id':slc['id'],'name':'New SLC Alias'})
            self.assertEqual([t for t in self.service.tags() if not t.get('builtin')][1]['name'],'New SLC Alias')
