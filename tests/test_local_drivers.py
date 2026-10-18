import tempfile
import unittest
from pathlib import Path
from hmi.service import Service
from hmi.store import Store
from hmi.local_drivers import DatabaseDriver,SystemDriver,database_settings

class LocalDriverTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.service=Service(Store(Path(self.temp.name)/'config.sqlite3'))
    def tearDown(self):
        for driver in self.service.drivers.values():driver.close()
        self.temp.cleanup()
    def test_system_memory_paths_and_builtin_protection(self):
        system=[s for s in self.service.sources() if s['kind']=='system'];self.assertEqual(len(system),1)
        self.service.add_tag({'source':'system','name':'ExampleTag'})
        tag=next(t for t in self.service.tag_catalog() if t['name']=='ExampleTag')
        self.assertEqual(tag['path'],'System\\Memory\\ExampleTag')
        self.service.act({'tag':tag['id'],'action':'set','value':42})
        self.assertEqual(self.service.values([tag['id']])[tag['id']]['value'],42)
        self.service.edit_tag({'id':tag['id'],'name':'Renamed'})
        self.assertEqual(self.service.drivers['system'].read(tag['address']),42)
        time=next(t for t in self.service.tag_catalog() if t['path']=='System\\Time\\Year')
        self.assertGreaterEqual(self.service.drivers['system'].read(time['address']),2026)
        for operation,data in [(self.service.remove_source,{'id':'system'}),(self.service.edit_source,{'id':'system'}),(self.service.remove_tag,{'id':time['id']}),(self.service.edit_tag,{'id':time['id'],'name':'Bad'})]:
            with self.assertRaises(ValueError):operation(data)
        with self.assertRaises(ValueError):self.service.act({'tag':time['id'],'action':'set','value':1})
        with self.assertRaises(ValueError):self.service.add_source({'kind':'system','name':'Another'})
    def test_database_persists_renames_and_batches(self):
        self.service.add_source({'id':'db','name':'Persistent','kind':'database','settings':{'filename':'Values'}})
        self.service.add_tag({'source':'db','name':'Setpoint'})
        tag=next(t for t in self.service.tags() if t['source']=='db')
        self.service.act({'tag':tag['id'],'action':'set','value':12.5})
        self.service.edit_tag({'id':tag['id'],'name':'New Name'})
        driver=DatabaseDriver({'filename':'Values'});driver.bind(Path(self.temp.name)/'databases')
        self.assertEqual(driver.read(tag['address']),12.5)
        self.assertEqual(driver.read_many([tag['address'],'missing'])['missing']['value'],0)
        restored=Service(Store(self.service.store.path))
        self.assertEqual(restored.drivers['db'].read(tag['address']),12.5)
        self.assertEqual(next(t for t in restored.tag_catalog() if t['id']==tag['id'])['path'],'Persistent\\New Name')
        with self.assertRaises(ValueError):self.service.add_source({'kind':'database','name':'Duplicate','settings':{'filename':'Values.sqlite3'}})
    def test_filename_validation(self):
        for filename in ('../outside','C:\\outside.db','nested/file.db',''):
            with self.assertRaises(ValueError):database_settings({'filename':filename})
        self.assertEqual(database_settings({'filename':'Tags'})['filename'],'Tags.sqlite3')
    def test_readable_datetime(self):
        import datetime
        from unittest.mock import patch
        fixed=datetime.datetime(2026,10,18,4,43,0)
        with patch('hmi.local_drivers.datetime.datetime') as clock:
            clock.now.return_value=fixed
            self.assertEqual(SystemDriver({}).read('Time/DateTime'),'10/18/2026 4:43:00 AM')
    def test_time_batch_shape(self):
        result=SystemDriver({}).read_many(['Time/Second','Time/DateTime'])
        self.assertEqual(result['Time/Second']['quality'],'good')
        self.assertIsInstance(result['Time/DateTime']['value'],str)

    def test_runtime_constants_and_heartbeat(self):
        from unittest.mock import patch
        with patch('hmi.local_drivers.time.monotonic',return_value=100):driver=SystemDriver({})
        with patch('hmi.local_drivers.time.monotonic',return_value=90161):
            self.assertEqual(driver.read('Runtime/UptimeSeconds'),90061)
            self.assertEqual(driver.read('Runtime/Uptime'),'1d 01:01:01')
            self.assertEqual(driver.read('Heartbeat/Counter'),90061)
            self.assertIs(driver.read('Heartbeat/Toggle'),True)
        self.assertIs(driver.read('Constants/AlwaysTrue'),True)
        self.assertIs(driver.read('Constants/AlwaysFalse'),False)
        with self.assertRaises(ValueError):driver.write('Heartbeat/Counter',0)

    def test_connected_tags_and_disconnected_count(self):
        self.service.add_source({'id':'db','name':'Persistent','kind':'database','settings':{'filename':'Status'}})
        tag=next(t for t in self.service.tags() if t.get('connection_status'))
        self.assertEqual(next(t for t in self.service.tag_catalog() if t['id']==tag['id'])['path'],'Persistent\\Connected')
        self.assertIs(self.service.values([tag['id']])[tag['id']]['value'],True)
        self.assertEqual(self.service.drivers['system'].read('Connections/DisconnectedSources'),0)
        before=self.service.values([tag['id']])[tag['id']]['timestamp']
        self.service.polling.refresh_connections(force=True)
        self.assertEqual(self.service.values([tag['id']])[tag['id']]['timestamp'],before)
        self.service.drivers['db'].status=lambda:{'quality':'bad'}
        self.service.polling.refresh_connections(force=True)
        self.assertIs(self.service.values([tag['id']])[tag['id']]['value'],False)
        self.assertEqual(self.service.drivers['system'].read('Connections/DisconnectedSources'),1)
        for method,data in [(self.service.act,{'tag':tag['id'],'action':'set','value':1}),(self.service.edit_tag,{'id':tag['id'],'name':'X'}),(self.service.remove_tag,{'id':tag['id']})]:
            with self.assertRaises(ValueError):method(data)
        self.assertFalse(any(t.get('builtin') for t in self.service.store.get('tags',[])))
