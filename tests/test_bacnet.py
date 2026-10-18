import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from hmi.bacnet import BACnetDriver, bacnet_settings, parse_address, path_suffix
from hmi.drivers import DRIVERS
from hmi.service import Service
from hmi.store import Store

SETTINGS = {'local_ip': '192.0.2.5', 'prefix': 24, 'timeout': .1, 'discovery_timeout': .1}


class FakeBAC0:
    instances = []
    def __init__(self, **options):
        self.options = options
        self.closed = False
        self.rpm = True
        self.segmented = True
        self.offline = False
        self.reads, self.writes = [], []
        self.value = 21.5
        self.instances.append(self)

    async def __aenter__(self):
        return self

    async def _disconnect(self):
        self.closed = True

    async def who_is(self, **options):
        return [SimpleNamespace(iAmDeviceIdentifier=(8, 1443213), pduSource='192.0.2.10')]

    async def read(self, request, **options):
        self.reads.append(request)
        if self.offline: raise ValueError('Device offline')
        _, kind, instance, prop = request.split()
        if prop == 'objectList':
            objects = [(2, 200), (5, 1)]
            if not self.segmented:
                index = options.get('arr_index')
                if index is None: raise ValueError('segmentation-not-supported')
                return len(objects) if index == 0 else objects[index - 1]
            return objects
        if prop == 'objectName':
            return 'Controller One' if kind == 'device' else 'Room Temperature' if kind == '2' else 'Fan'
        if prop == 'presentValue':
            return self.value if kind == '2' else 1
        if prop == 'eventState':
            return 0
        if prop == 'units' and kind == '2':
            return 'degrees-celsius'
        raise ValueError('unknown-property')

    async def readMultiple(self, request, **options):
        if not self.rpm:
            raise ValueError('RPM unsupported')
        parts = request.split()
        return [await self.read(' '.join([parts[0], *parts[index:index + 3]])) for index in range(1, len(parts), 3)]

    async def _write(self, request):
        self.writes.append(request)
        parts = request.split()
        if parts[1] == '2':
            self.value = float(parts[4])
        return None


class BACnetTests(unittest.TestCase):
    def setUp(self):
        self.driver = BACnetDriver(SETTINGS, factory=FakeBAC0)

    def tearDown(self):
        self.driver.close()

    def test_settings_identifiers_discovery_objects_and_properties(self):
        for settings in ({'local_ip': ''}, {**SETTINGS, 'port': 0}, {**SETTINGS, 'prefix': 33},
                         {**SETTINGS, 'live': .01}, {**SETTINGS, 'write_priority': 17}):
            with self.assertRaises(ValueError): bacnet_settings(settings)
        self.assertEqual(self.driver.browse()['items'][0]['name'], 'Controller One [1443213]')
        FakeBAC0.instances[-1].segmented = False
        objects = self.driver.browse('1443213')['items']
        self.assertEqual(objects[0]['name'], 'Room Temperature')
        properties = self.driver.properties(objects[1]['node'])['items']
        self.assertTrue(properties[0]['available'])
        self.assertFalse(any(item['property']=='units' and item['available'] for item in properties))
        self.assertEqual(parse_address('1443213/2:200/presentValue'), (1443213, 2, 200, 'presentValue'))
        self.assertEqual(path_suffix('1443213/2:200/presentValue'), r'1443213\OBJECT_ANALOG_VALUE:200\presentValue')

    def test_all_advertised_properties_cache_complex_preview_and_writes(self):
        self.driver.test()
        client=FakeBAC0.instances[-1];original=client.read
        async def read(request, **kwargs):
            prop=request.split()[-1]
            if prop=='propertyList':return ['presentValue','description','statusFlags','512']
            if prop=='description':return 'Room sensor'
            if prop=='statusFlags':return [False,True,False,False]
            if prop=='512':return 42
            return await original(request, **kwargs)
        client.read=read
        result=self.driver.properties('1443213/2:200')
        items={item['property']:item for item in result['items']}
        self.assertEqual(items['description']['value'],'Room sensor')
        self.assertEqual(items['512']['value'],42)
        self.assertFalse(items['statusFlags']['selectable']);self.assertIn('true',items['statusFlags']['preview'])
        result['items'][0]['added']=True
        self.assertNotIn('added',self.driver.properties('1443213/2:200')['items'][0])
        self.assertEqual(parse_address('1443213/2:200/description')[-1],'description')
        self.driver.write('1443213/2:200/512',7)
        self.assertIn('512 7',client.writes[-1])
        async def rejected(request):raise ValueError('write-access-denied')
        client._write=rejected
        with self.assertRaisesRegex(ValueError,'description.*write-access-denied'):
            self.driver.write('1443213/2:200/description',1)

    def test_device_cached_by_polling_resolves_its_object_name(self):
        self.driver.read_many(['1443213/2:200/presentValue'])
        self.assertEqual(self.driver.devices[1443213]['name'], '1443213')
        item = self.driver.browse()['items'][0]
        self.assertEqual(item['name'], 'Controller One [1443213]')
        reads = len(FakeBAC0.instances[-1].reads)
        self.driver.browse()
        self.assertEqual(len(FakeBAC0.instances[-1].reads), reads)

    def test_device_object_is_labeled_device_properties(self):
        self.driver.browse()
        self.driver.objects[1443213] = [{'device':1443213,'object_type':8,'object_instance':1443213,
                                       'node':'1443213/8:1443213','name':'Cached original name','named':True}]
        item = self.driver.browse('1443213')['items'][0]
        self.assertEqual(item['name'], 'Device Properties')
        self.assertEqual(item['node'], '1443213/8:1443213')
        self.assertEqual(item['type'], 'OBJECT_DEVICE:1443213')

    def test_batch_fallback_binary_write_and_acknowledged_values(self):
        addresses = ['1443213/2:200/presentValue', '1443213/2:200/eventState', '1443213/2:200/units']
        result = self.driver.read_many(addresses)
        self.assertEqual(result[addresses[0]]['value'], 21.5)
        client = FakeBAC0.instances[-1]
        client.rpm = False
        self.assertEqual(self.driver.read_many(addresses)[addresses[1]]['value'], 0)
        client.offline=True
        before=len(client.reads)
        result=self.driver.read_many([f'1443213/2:{instance}/presentValue' for instance in range(200,240)])
        self.assertTrue(all(sample['quality']=='bad' for sample in result.values()))
        self.assertLessEqual(len(client.reads)-before,2)
        client.offline=False;self.driver.retry_at=0;self.driver.device_failures.clear()
        self.driver.write('1443213/5:1/presentValue', 1)
        self.assertIn('presentValue active - 16', client.writes[-1])
        with self.assertRaises(ValueError): self.driver.write('1443213/5:1/presentValue', 2)
        self.driver.write(addresses[2], 1)
        self.assertIn('units 1', client.writes[-1])
        self.driver.write(addresses[0], 25)
        self.assertEqual(self.driver.read(addresses[0]), 25)

    def test_offline_cooldown_and_recovery(self):
        self.driver.test()
        client=FakeBAC0.instances[-1]
        client.offline=True
        address='1443213/2:200/presentValue'
        self.assertEqual(self.driver.read_many([address])[address]['quality'],'bad')
        count=len(client.reads)
        self.driver.read_many([address]);self.driver.read_many([address])
        self.assertEqual(len(client.reads),count)
        client.offline=False;self.driver.retry_at=0;self.driver.device_failures.clear()
        self.assertEqual(self.driver.read_many([address])[address]['quality'],'good')
        self.assertEqual(self.driver.status()['quality'],'good')

    def test_matching_sessions_are_shared_and_released(self):
        self.driver.test()
        client = FakeBAC0.instances[-1]
        other = BACnetDriver({**SETTINGS, 'live': 1}, factory=FakeBAC0)
        self.assertIs(other.session, self.driver.session)
        other.test()
        other.close()
        self.assertFalse(client.closed)
        self.driver.close()
        self.assertTrue(client.closed)

    def test_service_property_identity_paths_formulas_and_rate_edit(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            with patch.dict(DRIVERS, {'bacnet': lambda settings: BACnetDriver(settings, factory=FakeBAC0)}):
                service = Service(Store(Path(folder) / 'hmi.sqlite3'))
                receipt=service.test_source({'kind':'bacnet','settings':SETTINGS})
                service.add_source({'id': 'bacnet', 'name': 'BacNet1', 'kind': 'bacnet', 'settings': SETTINGS,'test_token':receipt['test_token']})
                self.assertTrue(service.sources()[0]['tested_at'])
                driver = service.drivers['bacnet']
                try:
                    for prop in ('presentValue', 'eventState', 'units'):
                        service.add_tag({'source': 'bacnet', 'address': '1443213/2:200/' + prop, 'name': 'Room ' + prop})
                    tags = [t for t in service.tag_catalog() if not t.get('builtin')]
                    self.assertEqual({tag['name'] for tag in tags}, {'Room presentValue', 'Room eventState', 'Room units'})
                    with self.assertRaisesRegex(ValueError, 'Tag name is required'):
                        service.add_tag({'source':'bacnet','address':'1443213/2:200/objectName','name':'  '})
                    self.assertEqual(len({tag['path'] for tag in tags}), 3)
                    self.assertEqual(tags[0]['path'], r'BacNet1\Room presentValue')
                    with self.assertRaises(ValueError): service.add_tag({'source': 'bacnet', 'address': tags[0]['address']})
                    with self.assertRaisesRegex(ValueError, 'already exists'):
                        service.add_tag({'source':'bacnet','address':'1443213/2:200/objectName','name':'room PRESENTVALUE'})
                    page = service.pages()[0]
                    page['controls'] = [{'id': 'label', 'text': '@{' + tags[0]['path'] + '}'}]
                    service.save_page(page)
                    self.assertEqual(page['controls'][0]['textRefs'][tags[0]['path']], tags[0]['id'])
                    service.polling.poll_due(asynchronous=False)
                    self.assertEqual(service.values()[tags[0]['id']]['value'], 21.5)
                    try:
                        import formulas
                    except ImportError:
                        formulas = None
                    if formulas:
                        service.add_source({'id':'sheet','name':'Sheet1','kind':'sheet','settings':{'filename':'Bacnet Test'}})
                        result = service.save_sheet({'source':'sheet','cells':{'A1':{'raw':'=TAG("'+tags[0]['path']+'")+1'},'B1':{'raw':'=TAG("'+tags[2]['path']+'")'}}})
                        self.assertEqual(result['values']['A1']['value'],22.5)
                        self.assertEqual(result['values']['B1']['value'],'degrees-celsius')
                    service.edit_source({'id': 'bacnet', 'name': 'Renamed BACnet', 'settings': {**driver.settings, 'live': 1}})
                    self.assertIs(service.drivers['bacnet'], driver)
                    self.assertTrue(service.tag_catalog()[0]['path'].startswith('Renamed BACnet\\'))
                    if formulas:
                        self.assertIn('Renamed BACnet',service.get_sheet({'source':'sheet'})['cells']['A1']['raw'])
                    properties = service.browse_source({'source': 'bacnet', 'node': '1443213/2:200', 'properties': True})
                    self.assertTrue(all(item['added'] for item in properties['items'] if item['property'] in ('presentValue','eventState','units')))
                    self.assertTrue(any(item['property']=='objectName' for item in properties['items']))
                    original_id=tags[0]['id']
                    original_address=tags[0]['address']
                    service.edit_tag({'id':original_id,'name':'Renamed sensor'})
                    renamed=next(t for t in service.tag_catalog() if t['id']==original_id)
                    self.assertEqual(renamed['name'],'Renamed sensor')
                    self.assertEqual(renamed['address'],original_address)
                    self.assertEqual(renamed['path'],r'Renamed BACnet\Renamed sensor')
                    service.save_page(page)
                    self.assertEqual(page['controls'][0]['textRefs'][tags[0]['path']],original_id)
                    with self.assertRaisesRegex(ValueError,'already exists'):
                        service.edit_tag({'id':tags[1]['id'],'name':'Renamed sensor'})
                finally:
                    driver.close()
