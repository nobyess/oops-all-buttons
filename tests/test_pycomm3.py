import copy
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from hmi.pycomm3_logix import PyComm3LogixDriver, connection_settings, bind_plc_socket
from hmi.drivers import DRIVERS
from hmi.service import Service
from hmi.store import Store

SETTINGS = {'plc_type': 'controllogix', 'path': '192.0.2.1/1'}


def atomic(dtype='DINT', access='Read/Write', dims=None):
    return {'data_type_name': dtype, 'external_access': access, 'dimensions': dims or []}


class FakePLC:
    instances = []
    catalog = {'Counter': atomic(), 'Readonly': atomic('REAL', 'Read Only'),
               'Flags': atomic('BOOL', dims=[2, 3, 0]),
               'Program:Main.Speed': atomic('REAL'),
               'Message': {**atomic('STRING'), 'data_type': {'string': 82}},
               'Motor': {**atomic('MOTOR'), 'data_type': {'attributes': ['Speed', 'History'], 'internal_tags': {
                   'Speed': atomic('REAL'), 'History': {**atomic(), 'array': 250}}}}}

    def __init__(self, path, **kwargs):
        self.path, self.kwargs = path, kwargs
        self.connected = False
        self.tags = {}
        self.info = {'product_name': '1756-L8x ControlLogix'}
        self.discoveries = 0
        self.reads = []
        self.writes = []
        self.fail = False
        self.__class__.instances.append(self)

    def open(self):
        self.connected = True
        return True

    def get_tag_list(self, **kwargs):
        self.discoveries += 1
        self.tags = copy.deepcopy(self.catalog)
        return list(self.tags.values())

    def read(self, *addresses):
        if self.fail:
            raise OSError('Cable disconnected')
        self.reads.append(addresses)
        result = [SimpleNamespace(value=7, error='Missing' if address == 'Missing' else None) for address in addresses]
        return result[0] if len(result) == 1 else result

    def write(self, item):
        self.writes.append(item)
        return SimpleNamespace(error=None)

    def close(self):
        self.connected = False


class DriverTests(unittest.TestCase):
    def setUp(self):
        FakePLC.instances.clear()
        self.driver = PyComm3LogixDriver(SETTINGS, FakePLC)

    def test_repeated_cooldown_errors_stay_short_and_allow_reconnect(self):
        clock = [0.0]
        driver = PyComm3LogixDriver({**SETTINGS, 'local_ip': '192.0.2.20'}, FakePLC)
        with patch('hmi.pycomm3_logix.time.monotonic', side_effect=lambda: clock[0]), patch('hmi.pycomm3_logix.bind_plc_socket'):
            driver.test()
            driver.plc.fail = True
            with self.assertRaises(ValueError):
                driver.read_many(['Counter'])
            deadline = driver.retry_at
            for instant in (.1, .2, .5, 1, 2, 2.9):
                clock[0] = instant
                with self.assertRaises(ValueError):driver.read_many(['Counter'])
                self.assertEqual(driver.status()['message'].count('(local interface'),1)
                self.assertEqual(driver.retry_at,deadline)
            self.assertEqual(len(FakePLC.instances),1)
            clock[0] = 3.1
            self.assertEqual(driver.read_many(['Counter'])['Counter']['value'],7)
            self.assertEqual(driver.status()['quality'],'good')
            self.assertEqual(len(FakePLC.instances),2)

    def test_settings_defaults_and_validation(self):
        self.assertEqual(connection_settings(SETTINGS)['live'], 0.5)
        self.assertEqual(connection_settings(SETTINGS)['background'], 20)
        for settings in ({**SETTINGS, 'plc_type': 'slc'}, {**SETTINGS, 'path': ''},
                         {**SETTINGS, 'live': 0}, {**SETTINGS, 'background': 'nan'},
                         {**SETTINGS, 'live': 30, 'background': 20}):
            with self.assertRaises(ValueError): connection_settings(settings)

    def test_local_interface_binding_and_validation(self):
        with self.assertRaises(ValueError):connection_settings({**SETTINGS, 'local_ip': 'Ethernet'})
        with self.assertRaises(ValueError):connection_settings({**SETTINGS, 'local_ip': '0.0.0.0'})
        self.assertNotIn('local_ip', connection_settings({**SETTINGS, 'local_ip': ''}))
        bound = PyComm3LogixDriver({**SETTINGS, 'local_ip': '192.0.2.20'}, FakePLC)
        with patch('hmi.pycomm3_logix.bind_plc_socket') as bind:
            bound.test()
            bind.assert_called_once_with(bound.plc, '192.0.2.20', 3)
        calls = []
        transport = SimpleNamespace(sock=SimpleNamespace(bind=lambda value: calls.append(value)))
        plc = SimpleNamespace()
        bind_plc_socket(plc, '192.0.2.20', 3, lambda timeout: transport)
        self.assertIs(plc._sock, transport)
        self.assertEqual(calls, [('192.0.2.20', 0)])
        bound.close()

    def test_lazy_connection_and_cached_refresh(self):
        self.assertEqual(FakePLC.instances, [])
        self.driver.browse()
        plc = self.driver.plc
        self.assertEqual(plc.discoveries, 1)
        self.assertEqual(plc.socket_timeout, 3)
        self.driver.browse()
        self.assertEqual(plc.discoveries, 1)
        self.driver.browse(refresh=True)
        self.assertEqual(plc.discoveries, 2)
        self.assertTrue(self.driver.describe('Program:Main.Speed')['writable'])
        self.assertFalse(self.driver.describe('Readonly')['writable'])

    def test_arrays_structs_paging_and_validation(self):
        self.driver.browse()
        rows = self.driver.browse('Flags')['items']
        self.assertEqual(rows[0]['address'], 'Flags[0]')
        self.assertTrue(rows[0]['children'])
        rows = self.driver.browse('Flags[0]')['items']
        self.assertEqual(rows[-1]['address'], 'Flags[0,2]')
        self.assertTrue(rows[0]['selectable'])
        self.assertEqual(self.driver.describe('Flags[0,2]')['type'], 'BOOL')
        self.assertEqual(self.driver.describe('Motor.History[249]')['type'], 'DINT')
        members = self.driver.browse('Motor')['items']
        self.assertEqual(members[0]['address'], 'Motor.Speed')
        page = self.driver.browse('Motor.History', offset=200)
        self.assertEqual(page['total'], 250)
        self.assertEqual(len(page['items']), 50)
        self.assertEqual(self.driver.describe('Message')['type'], 'STRING')
        for address in ('Flags', 'Flags[2,0]', 'Flags[0]', 'Motor', 'Motor.Bad', 'Missing'):
            with self.assertRaises(ValueError): self.driver.describe(address)

    def test_tree_groups_program_tags_and_keeps_array_branches(self):
        root = self.driver.browse(tree=True)['items']
        self.assertEqual(root[0]['address'], 'Program:Main')
        program = next(item for item in root if item['address'] == 'Program:Main')
        self.assertTrue(program['children'])
        self.assertFalse(program['selectable'])
        self.assertNotIn('Program:Main.Speed', [item['address'] for item in root])
        self.assertEqual(self.driver.browse('Program:Main', tree=True)['items'][0]['address'], 'Program:Main.Speed')
        self.assertEqual(self.driver.browse(tree=True, search='Speed')['items'][0]['address'], 'Program:Main')
        self.assertEqual(self.driver.browse('Motor', tree=True)['total'], 2)

    def test_batched_read_per_tag_fault_write_and_reconnect(self):
        result = self.driver.read_many(['Counter', 'Missing'])
        self.assertEqual(result['Counter']['value'], 7)
        self.assertEqual(result['Missing']['quality'], 'bad')
        self.driver.write('Counter', 10.0)
        self.assertIsInstance(self.driver.plc.writes[-1][1], int)
        self.driver.write('Flags[0,0]', 1)
        self.assertIs(self.driver.plc.writes[-1][1], True)
        old = self.driver.plc
        old.fail = True
        with self.assertRaises(ValueError): self.driver.read_many(['Counter'])
        self.assertEqual(self.driver.status()['quality'], 'bad')
        with self.assertRaises(ValueError): self.driver.read_many(['Counter'])
        self.assertEqual(len(FakePLC.instances), 1)
        self.driver.retry_at = 0
        self.assertEqual(self.driver.read('Counter'), 7)
        self.assertEqual(len(FakePLC.instances), 2)


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.patch = patch.dict(DRIVERS, {'pycomm3': lambda settings: PyComm3LogixDriver(settings, FakePLC)})
        self.patch.start()
        self.service = Service(Store(Path(self.temp.name) / 'test.sqlite3'))

    def tearDown(self):
        for driver in self.service.drivers.values(): driver.close()
        self.patch.stop()
        self.temp.cleanup()

    def test_connection_receipt_and_duplicate_addresses(self):
        receipt = self.service.test_source({'settings': SETTINGS})
        self.service.add_source({'id': 'PLC', 'kind': 'pycomm3', 'settings': SETTINGS, 'test_token': receipt['test_token']})
        self.assertTrue(self.service.sources()[0]['tested_at'])
        self.service.add_source({'id': 'Other', 'kind': 'pycomm3', 'settings': {**SETTINGS, 'path': '192.0.2.2'}, 'test_token': receipt['test_token']})
        self.assertIsNone(self.service.sources()[1]['tested_at'])
        self.service.add_tag({'id': 'Counter', 'source': 'PLC', 'address': 'Counter'})
        with self.assertRaises(ValueError): self.service.add_tag({'id': 'Alias', 'source': 'PLC', 'address': 'Counter'})
        self.service.add_tag({'id': 'OtherCounter', 'source': 'Other', 'address': 'Counter'})
        tags = self.service.tag_catalog()
        self.assertEqual(tags[0]['path'], r'PLC\Counter')
        listed = self.service.browse_source({'source': 'PLC'})
        self.assertTrue(next(item for item in listed['items'] if item['address'] == 'Counter')['added'])

    def test_cached_values_and_page_interest(self):
        self.service.add_source({'id': 'PLC', 'kind': 'pycomm3', 'settings': SETTINGS})
        self.service.add_tag({'id': 'Counter', 'source': 'PLC', 'address': 'Counter'})
        driver = self.service.drivers['PLC']
        self.assertEqual(driver.plc.reads, [])
        self.assertEqual(self.service.values()['Counter']['quality'], 'bad')
        self.service.polling.poll_due(asynchronous=False)
        count = len(driver.plc.reads)
        self.assertEqual(self.service.values()['Counter']['value'], 7)
        self.service.values();self.service.values()
        self.assertEqual(len(driver.plc.reads), count)
        page = self.service.pages()[0]
        page['controls'] = [{'id': 'display', 'binding': {'tag': 'Counter'}}]
        self.service.save_page(page)
        self.service.live_interest('tab1', {'pages': [page['id']]})
        self.assertIn('Counter', self.service.polling.leases['tab1'][1])
        self.service.act({'tag': 'Counter', 'action': 'increment', 'value': 1})
        self.assertEqual(self.service.values()['Counter']['value'], 7)
        self.assertEqual(driver.plc.writes[-1], ('Counter', 8))


class EditTests(IntegrationTests):
    def test_edit_poll_rates_preserves_connection_and_references(self):
        self.service.add_source({'id': 'PLC', 'kind': 'pycomm3', 'settings': SETTINGS})
        self.service.add_tag({'id': 'Counter', 'source': 'PLC', 'address': 'Counter'})
        driver = self.service.drivers['PLC']
        plc = driver.plc
        self.service.edit_source({'id': 'PLC', 'settings': {**SETTINGS, 'background': 60, 'live': 0.1}})
        self.assertIs(self.service.drivers['PLC'], driver)
        self.assertIs(driver.plc, plc)
        self.assertEqual(self.service.polling.sources['PLC']['settings']['background'], 60)
        for value in (0.09, 60.01, float('nan')):
            with self.assertRaises(ValueError):
                self.service.edit_source({'id': 'PLC', 'settings': {**SETTINGS, 'background': value}})
        self.service.edit_source({'id': 'PLC', 'settings': {**SETTINGS, 'path': '192.0.2.2'}})
        self.assertIsNot(self.service.drivers['PLC'], driver)
        self.assertFalse(plc.connected)
        self.assertEqual(self.service.tag_catalog()[0]['path'], r'PLC\Counter')

    def test_source_rename_preserves_ids_tags_pages_cache_and_connection(self):
        self.service.add_source({'id': 'PLC', 'kind': 'pycomm3', 'settings': SETTINGS})
        self.service.add_tag({'id': 'Counter', 'source': 'PLC', 'address': 'Counter'})
        page = self.service.pages()[0]
        page['controls'] = [{'id': 'button', 'type': 'button', 'actions': [{'id': 'a', 'tag': 'Counter', 'action': 'set', 'value': 1}],
                             'events': [{'id': 'e', 'tag': 'Counter', 'operator': '>', 'operand': {'kind': 'value', 'value': 0}, 'action': 'hide'}]}]
        self.service.save_page(page)
        before_tags, before_pages = self.service.tags(), self.service.pages()
        driver = self.service.drivers['PLC']
        self.service.polling.update('Counter', 7)
        self.service.edit_source({'id': 'PLC', 'name': 'New PLC Name'})
        self.assertEqual(self.service.sources()[0]['id'], 'PLC')
        self.assertEqual(self.service.sources()[0]['name'], 'New PLC Name')
        self.assertEqual(self.service.tags(), before_tags)
        self.assertEqual(self.service.pages(), before_pages)
        self.assertIs(self.service.drivers['PLC'], driver)
        self.assertEqual(self.service.values()['Counter']['value'], 7)
        self.assertEqual(self.service.tag_catalog()[0]['source_name'], 'New PLC Name')
        self.assertEqual(self.service.tag_catalog()[0]['path'], r'New PLC Name\Counter')
        for name in ('', '   '):
            with self.assertRaises(ValueError):self.service.edit_source({'id': 'PLC', 'name': name})
        self.service.add_source({'name': 'Other', 'kind': 'memory'})
        self.assertNotEqual(self.service.sources()[1]['id'], 'Other')
        with self.assertRaises(ValueError):self.service.edit_source({'id': 'PLC', 'name': 'other'})
        # Simulate a legacy configuration and ensure migration only adds a name.
        legacy = [{k: v for k, v in source.items() if k != 'name'} for source in self.service.sources()]
        self.service.store.set('sources', legacy)
        restored = Service(self.service.store)
        self.assertEqual(restored.sources()[0]['name'], 'PLC')
        self.assertEqual(restored.tags(), before_tags)
        self.assertEqual(restored.pages(), before_pages)
        restored.edit_source({'id': 'PLC', 'name': 'Renamed Again'})
        restarted = Service(self.service.store)
        self.assertEqual(restarted.sources()[0]['name'], 'Renamed Again')
        self.assertEqual(restarted.tags(), before_tags)
        for service in (restored, restarted):
            for item in service.drivers.values():item.close()

    def test_set_writes_without_reading_plc_first(self):
        self.service.add_source({'id': 'PLC', 'kind': 'pycomm3', 'settings': SETTINGS})
        self.service.add_tag({'id': 'Counter', 'source': 'PLC', 'address': 'Counter'})
        plc = self.service.drivers['PLC'].plc
        self.service.act({'tag': 'Counter', 'action': 'set', 'value': 9})
        self.assertEqual(plc.reads, [])
        self.assertEqual(plc.writes, [('Counter', 9)])

    def test_plc_refused_write_still_raises_device_error(self):
        self.service.add_source({'id':'PLC','kind':'pycomm3','settings':SETTINGS})
        self.service.add_tag({'id':'Readonly','source':'PLC','address':'Readonly','writable':False})
        plc=self.service.drivers['PLC'].plc
        with patch.object(plc,'write',return_value=SimpleNamespace(error='PLC access denied')):
            with self.assertRaisesRegex(ValueError,'PLC access denied'):
                self.service.act({'tag':'Readonly','action':'set','value':3})
        self.assertNotEqual(self.service.values()['Readonly']['value'],3)

    def test_write_waits_for_scheduled_device_feedback(self):
        self.service.add_source({'id':'PLC','kind':'pycomm3','settings':SETTINGS})
        self.service.add_tag({'id':'Counter','source':'PLC','address':'Counter'})
        self.service.polling.clock=lambda:0
        self.service.polling.poll_due(False)
        plc=self.service.drivers['PLC'].plc
        count=len(plc.reads)
        self.service.act({'tag':'Counter','action':'set','value':42})
        self.assertEqual(plc.writes[-1],('Counter',42))
        self.assertEqual(len(plc.reads),count)
        self.assertEqual(self.service.batch_values({'tags':['Counter']})['values']['Counter']['value'],7)
        self.service.polling.clock=lambda:20
        with patch.object(plc,'read',return_value=SimpleNamespace(value=99,error=None)):
            self.service.polling.poll_due(False)
        self.assertEqual(self.service.values()['Counter']['value'],99)

    def test_edit_tag_access_and_memory_address(self):
        self.service.add_source({'id': 'PLC', 'kind': 'pycomm3', 'settings': SETTINGS})
        self.service.add_tag({'id': 'Counter', 'source': 'PLC', 'address': 'Counter', 'writable': False})
        self.service.edit_tag({'id': 'Counter', 'writable': True})
        self.assertTrue(self.service.tags()[0]['writable'])
        self.service.add_tag({'id': 'Readonly', 'source': 'PLC', 'address': 'Readonly'})
        self.service.edit_tag({'id': 'Readonly', 'writable': True})
        self.service.act({'tag':'Readonly','action':'set','value':3})
        self.assertEqual(self.service.drivers['PLC'].plc.writes[-1],('Readonly',3.0))
        self.service.add_source({'id': 'Mem', 'kind': 'memory'})
        self.service.add_tag({'id': 'M', 'source': 'Mem', 'address': 'a'})
        self.service.edit_tag({'id': 'M', 'address': 'b', 'writable': False})
        self.assertEqual(self.service.tags()[-1]['address'], 'M')
        self.assertTrue(self.service.tags()[-1]['writable'])
