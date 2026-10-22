"""LightYak transport/driver integration with a simulated serial device."""
import json
import math
import struct
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from hmi import lightyak_codec as w
from hmi.lightyak import LightYakDriver, lightyak_settings, _registry
from hmi.service import Service
from hmi.store import Store


class Device:
    def __init__(self):
        self.revision=1;self.opens=0;self.closes=0;self.calls=[];self.drop=False;self.error=0;self.malformed=False
        self.tags=[w.Tag(0,p,t,False,n) for p,t,n in [(1,1,'Heartbeat'),(2,4,'Protocol Version'),(3,8,'Catalog Revision'),(4,4,'Payload Limit'),(5,4,'Batch Limit'),(6,4,'Initialization Status')]]
        self.tags += [w.Tag(i,0,i,True,'Tag '+str(i)) for i in range(1,10)]
        self.values={t.target:(True if t.type==1 else 'A' if t.type==2 else 12.5 if t.type==9 else 12) for t in self.tags}

    def factory(self, **settings):
        self.opens+=1;device=self
        class Serial:
            def __init__(self):self.decoder=w.Decoder();self.pending=bytearray();self.closed=False
            def reset_input_buffer(self):self.pending.clear()
            def close(self):self.closed=True;device.closes+=1
            def read(self,n):
                if not self.pending:time.sleep(.001);return b''
                result=bytes(self.pending[:n]);del self.pending[:n];return result
            def write(self,data):
                assert not self.pending, 'Overlapping requests'
                for packet in self.decoder.feed(data):
                    device.calls.append(packet.operation)
                    reply=device.reply(packet)
                    if device.drop and packet.operation==w.WRITE:device.drop=False;continue
                    if device.malformed:reply=b'bad';device.malformed=False
                    operation=packet.operation|128
                    if device.error and packet.operation==w.WRITE:operation=255;reply=bytes([device.error]);device.error=0
                    self.pending.extend(w.encode(operation,packet.request,reply))
                return len(data)
        return Serial()

    def reply(self,packet):
        p=packet.payload
        if packet.operation==w.IDENTIFY:
            return bytes([0])+struct.pack('<HI',9,self.revision)+bytes([64,6,24,4])+b'Test'
        if packet.operation==w.BROWSE:
            cursor=struct.unpack('<H',p)[0];tag=self.tags[cursor];name=tag.name.encode()
            return struct.pack('<HHBBBB',cursor+1 if cursor+1<len(self.tags) else 65535,tag.reference,tag.property,tag.type,int(tag.writable),len(name))+name
        if packet.operation==w.READ:
            result=bytearray([p[0]])
            for i in range(p[0]):
                target=struct.unpack_from('<HB',p,1+3*i);tag=next(t for t in self.tags if t.target==target)
                value=w.pack_value(tag.type,(self.revision if target==(0,3) else self.values[target]));result.extend(struct.pack('<HBBBB',*target,0,tag.type,len(value))+value)
            return bytes(result)
        if packet.operation==w.WRITE:
            result=bytearray([p[0]]);pos=1
            for i in range(p[0]):
                ref,prop,typ,size=struct.unpack_from('<HBBB',p,pos);pos+=5
                self.values[(ref,prop)]=w.unpack_value(typ,p[pos:pos+size]);pos+=size
                result.extend(struct.pack('<HBB',ref,prop,0))
            return bytes(result)
        raise AssertionError('Unknown operation')


class CodecTests(unittest.TestCase):
    def test_golden_crc_and_frames(self):
        self.assertEqual(w.crc16(b'123456789'),0x29b1)
        self.assertEqual(w.encode(w.IDENTIFY,1).hex(),'7e0101000100d8fe7e')
        self.assertEqual(w.encode(w.READ,2,b'\x01\x00\x00\x01').hex(),'7e010300020401000001f75f7e')

    def test_fragmentation_escapes_shared_delimiters_and_resync(self):
        first=w.encode(129,1,b'\x7e\x7d');second=w.encode(130,2,b'abc')
        decoder=w.Decoder();packets=[]
        for byte in first+second[1:]:packets+=decoder.feed(bytes([byte]))
        self.assertEqual([p.payload for p in packets],[b'\x7e\x7d',b'abc'])
        for broken in (b'\x7e\x7d\x00\x7e',b'\x7e'+b'x'*200+b'\x7e',first[:-3]+b'\x00\x00\x7e'):
            decoder=w.Decoder();self.assertEqual(decoder.feed(broken),[])
            self.assertEqual(decoder.feed(second)[0].payload,b'abc')
            self.assertLessEqual(len(decoder.body),71)

    def test_invalid_scalar_encoding(self):
        for typ,data in [(1,b'\x02'),(0,b''),(7,b'\x00')]:
            with self.assertRaises(w.ProtocolError):w.unpack_value(typ,data)


class DriverTests(unittest.TestCase):
    def setUp(self):
        self.device=Device();self.drivers=[]
        self.settings={'serial_port':'lightyak-unit-test','timeout':.1,'offline_retry':1,'startup_delay':0}
        self.driver=self.make()

    def make(self, **changes):
        driver=LightYakDriver({**self.settings,**changes},self.device.factory);self.drivers.append(driver);return driver

    def tearDown(self):
        for driver in self.drivers:driver.close()

    def app(self, ref):return next(row['address'] for row in self.driver.browse() if row['reference']==ref)

    def test_discovery_first_read_types_and_batching(self):
        rows=self.driver.browse();self.assertEqual(len(rows),15)
        self.assertEqual(self.driver.browse_catalog()['device_name'],'Test')
        self.assertEqual(self.device.opens,1)
        result=self.driver.read_many([row['address'] for row in rows])
        self.assertTrue(all(sample['quality']=='good' for sample in result.values()))
        self.assertEqual(self.device.calls.count(w.READ),3)
        self.assertEqual(self.driver.read(self.app(2)),'A')
        self.assertEqual(self.driver.read(self.app(9)),12.5)
        self.assertEqual(self.driver.test()['tag_count'],9)

    def test_initial_poll_connects_without_test(self):
        # A persisted fingerprint is enough; no Test Connection is needed.
        from hmi.lightyak import tag_address
        address=tag_address(self.device.tags[6],1)
        self.assertTrue(self.driver.read(address));self.assertEqual(self.device.opens,1)

    def test_invalid_writes_leave_connection_alive(self):
        address=self.app(7)
        for value in (1.2,2**31,float('nan'),'bad'):
            with self.assertRaises(ValueError):self.driver.write(address,value)
        readonly=self.driver.browse()[0]['address']
        with self.assertRaisesRegex(ValueError,'read only'):self.driver.write(readonly,1)
        self.assertEqual(self.device.closes,0);self.assertEqual(self.device.calls.count(w.WRITE),0)
        self.driver.write(address,42.0);self.assertEqual(self.driver.read(address),42)
        self.driver.write(self.app(1),0);self.assertFalse(self.driver.read(self.app(1)))
        self.driver.write(self.app(2),'~');self.assertEqual(self.driver.read(self.app(2)),'~')

    def test_device_rejection_is_not_disconnect(self):
        address=self.app(7);self.device.error=3
        with self.assertRaisesRegex(ValueError,'NOT_WRITABLE'):self.driver.write(address,1)
        self.assertEqual(self.device.closes,0);self.assertEqual(self.driver.status()['quality'],'good')
        self.assertEqual(self.driver.read(address),1)  # fake applies before injecting the error

    def test_nan_is_bad_sample_without_breaking_transport(self):
        address=self.app(9);self.device.values[(9,0)]=float('nan')
        sample=self.driver.read_many([address])[address]
        self.assertEqual(sample['quality'],'bad');self.assertIsNone(sample['value'])
        json.dumps(sample,allow_nan=False);self.assertEqual(self.device.closes,0)
        self.device.values[(9,0)]=3.5;self.assertEqual(self.driver.read(address),3.5)

    def test_timeout_never_retries_write_and_backoff_limits_reconnects(self):
        address=self.app(7);self.device.drop=True
        with self.assertRaisesRegex(ValueError,'outcome uncertain'):self.driver.write(address,55)
        self.assertEqual(self.device.calls.count(w.WRITE),1)
        for _ in range(5):self.assertEqual(self.driver.read_many([address])[address]['quality'],'bad')
        self.assertEqual(self.device.opens,1)
        self.driver.connection.retry_at=0
        self.assertEqual(self.driver.read(address),55);self.assertEqual(self.device.opens,2)
        self.assertEqual(self.device.calls.count(w.WRITE),1)

    def test_malformed_response_disconnects_and_schema_change_blocks_saved_target(self):
        address=self.app(7);self.device.malformed=True
        self.assertEqual(self.driver.read_many([address])[address]['quality'],'bad')
        self.assertEqual(self.device.closes,1)
        self.device.revision=2;self.driver.connection.retry_at=0
        self.assertEqual(self.driver.read_many([address])[address]['quality'],'good')
        self.assertEqual(self.driver.status()['quality'],'good')
        self.assertEqual(self.driver.read(self.app(7)),12)

    def test_revision_refresh_preserves_unchanged_targets_without_reopening(self):
        address=self.app(7);heartbeat=self.driver.browse()[0]['address'];self.device.revision=2
        self.assertIn('Catalog refreshed',self.driver.read_many([heartbeat])[heartbeat]['error'])
        self.assertTrue(self.driver.read(heartbeat))
        self.driver.write(address,99)
        self.assertEqual(self.driver.read(address),99)
        self.assertEqual(self.device.opens,1)

    def test_revision_change_before_write_revalidates_changed_target(self):
        address=self.app(7);self.device.revision=2
        old=self.device.tags[12]
        self.device.tags[12]=w.Tag(old.reference,old.property,old.type,True,'Different')
        with self.assertRaisesRegex(ValueError,'Write not sent'):self.driver.write(address,99)
        self.assertEqual(self.device.calls.count(w.WRITE),0)

    def test_changed_name_with_same_revision_also_blocks_saved_target(self):
        address=self.app(7)
        old=self.device.tags[12];self.device.tags[12]=w.Tag(old.reference,old.property,old.type,True,'Different')
        self.driver.browse(refresh=True)
        with self.assertRaisesRegex(ValueError,'binding warning'):self.driver.write(address,99)
        self.assertEqual(self.device.calls.count(w.WRITE),0)

    def test_reordered_catalog_matches_original_name_and_type_on_refresh_and_connect(self):
        address=self.app(7)
        heartbeat=self.driver.browse()[0]['address']
        original=self.device.tags[12];other=self.device.tags[13]
        self.device.tags[12]=w.Tag(7,0,other.type,other.writable,other.name)
        self.device.tags[13]=w.Tag(8,0,original.type,original.writable,original.name)
        self.device.values[(8,0)]=456;self.device.revision=2
        self.driver.read_many([address])  # Detect and refresh, discard old samples.
        self.assertEqual(self.driver.read(address),456)
        self.assertTrue(self.driver.read(heartbeat))
        self.driver.write(address,789)
        self.assertEqual(self.device.values[(8,0)],789)
        self.driver.connection.disconnect()
        self.assertEqual(self.driver.read(address),789)

    def test_missing_changed_type_and_duplicate_matches_warn_without_writes(self):
        address=self.app(7);original=self.device.tags[12]
        for replacement in (w.Tag(7,0,original.type,True,'Renamed'),
                            w.Tag(7,0,8,True,original.name)):
            self.device.tags[12]=replacement;self.driver.browse(refresh=True)
            self.assertIn('binding warning',self.driver.read_many([address])[address]['error'])
        self.device.tags[12]=original
        self.device.tags[13]=w.Tag(8,0,original.type,True,original.name)
        self.driver.browse(refresh=True)
        self.assertIn('multiple device tags',self.driver.read_many([address])[address]['error'])
        with self.assertRaisesRegex(ValueError,'multiple device tags'):self.driver.write(address,99)
        self.assertEqual(self.device.calls.count(w.WRITE),0)

    def test_shared_port_serializes_test_browse_and_poll(self):
        second=self.make();address=self.app(7)
        with ThreadPoolExecutor(max_workers=4) as pool:
            jobs=[pool.submit(self.driver.read,address),pool.submit(second.test),pool.submit(second.browse),pool.submit(second.write,address,21)]
            for job in jobs:job.result(3)
        self.assertIs(self.driver.connection,second.connection);self.assertEqual(self.device.opens,1)
        self.driver.close();self.assertEqual(second.read(address),21);self.assertEqual(self.device.closes,0)
        second.close();self.assertEqual(self.device.closes,1)

    def test_settings_conflict_and_replacement(self):
        self.driver.test()
        with self.assertRaisesRegex(ValueError,'identical'):self.make(baudrate=9600)
        replacement=self.driver.replacement({**self.settings,'baudrate':9600});self.drivers.append(replacement)
        self.driver.close();replacement.test();self.assertEqual(self.device.opens,2)

    def test_startup_delay_default_and_explicit_zero(self):
        self.assertEqual(lightyak_settings({'serial_port':'COM1'})['startup_delay'],2)
        self.assertEqual(lightyak_settings({'serial_port':'COM1','startup_delay':0})['startup_delay'],0)

    def test_startup_delay_once_per_open(self):
        delayed=self.make(serial_port='lightyak-delayed-test',startup_delay=2)
        with patch('hmi.lightyak.time.sleep') as sleep:
            delayed.test();delayed.test();delayed.browse(refresh=True);self.assertEqual(sleep.call_args_list, [unittest.mock.call(2)])

    def test_settings_reject_bad_numbers_and_serial_urls(self):
        for change in ({'serial_port':'socket://host'},{'timeout':float('nan')},{'baudrate':1.5},{'stopbits':3},{'parity':'X'}):
            with self.assertRaises(ValueError):lightyak_settings({**self.settings,**change})


class ServiceTests(unittest.TestCase):
    def test_rebind_misnamed_motor_then_add_motor_and_poll_live_temperature(self):
        device=Device()
        device.tags[6]=w.Tag(1,0,1,True,'Motor Enabled')
        device.tags[8]=w.Tag(3,0,9,True,'Temperature')
        device.values[(1,0)]=False;device.values[(3,0)]=21.75
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict('hmi.service.DRIVERS',lightyak=lambda settings:LightYakDriver(settings,device.factory)):
                service=Service(Store(Path(folder)/'test.sqlite3'))
                try:
                    service.add_source({'id':'yak','name':'Yak','kind':'lightyak','settings':{'serial_port':'lightyak-rebind-test'}})
                    catalog=service.browse_source({'source':'yak'})['items']
                    motor=next(t for t in catalog if t['name']=='Motor Enabled')
                    temperature=next(t for t in catalog if t['name']=='Temperature')
                    # Reproduce the saved configuration reported by the user.
                    service.add_tag({'source':'yak','name':'Temperature','address':motor['address']})
                    saved=next(t for t in service.tags() if t['source']=='yak' and not t.get('builtin'))
                    self.assertEqual(saved['name'],'Motor Enabled')  # API ignores the supplied alias.
                    service.store.set('tags',[{**t,'name':'Temperature'} if t['id']==saved['id'] else t for t in service.store.get('tags',[])])
                    page={'id':'test','name':'Test','controls':[{'id':'reading','type':'numeric','binding':{'tag':saved['id']}}]}
                    service.store.set('pages',[page]);service.configure_polling()
                    service.polling.poll_due(asynchronous=False)
                    self.assertIs(service.values({saved['id']})[saved['id']]['value'],False)
                    # Explicit rebinding keeps the control's existing tag identity.
                    service.edit_tag({'id':saved['id'],'name':'Temperature','address':temperature['address']})
                    service.add_tag({'source':'yak','name':'Motor Enabled','address':motor['address']})
                    service.polling.interest('live-page',{saved['id']})
                    service.polling.poll_due(asynchronous=False)
                    sample=service.batch_values({'source':'yak','tags':[saved['id']],'pages':['test']})['values'][saved['id']]
                    self.assertEqual((sample['quality'],sample['value']),('good',21.75))
                    device.values[(3,0)]=22.5
                    service.polling.attempts[saved['id']]=-math.inf
                    service.polling.poll_due(asynchronous=False)
                    self.assertEqual(service.values({saved['id']})[saved['id']]['value'],22.5)
                    self.assertEqual(service.pages()[0]['controls'][0]['binding']['tag'],saved['id'])
                    names={t['name'] for t in service.tag_catalog() if t['source']=='yak'}
                    self.assertTrue({'Motor Enabled','Temperature'}<=names)
                finally:
                    for driver in service.drivers.values():driver.close()

    def test_create_browse_add_rename_poll_edit_and_restore(self):
        device=Device()
        with tempfile.TemporaryDirectory() as folder:
            def factory(settings):return LightYakDriver(settings,device.factory)
            with patch.dict('hmi.service.DRIVERS',lightyak=factory):
                service=Service(Store(Path(folder)/'hmi.sqlite3'))
                try:
                    service.add_source({'id':'yak','name':'Yak','kind':'lightyak','settings':{'serial_port':'lightyak-service-test'}})
                    catalog=service.browse_source({'source':'yak'});self.assertEqual(catalog['device_name'],'Test')
                    rows=catalog['items'];item=next(row for row in rows if row['reference']==7)
                    service.add_tag({'source':'yak','name':'Temperature','address':item['address']})
                    tag=next(t for t in service.tags() if t['source']=='yak' and not t.get('builtin'))
                    self.assertEqual(tag['data_type'],'INT32')
                    self.assertEqual(tag['name'],'Tag 7')
                    self.assertEqual(service.preview_source_tag({'source':'yak','address':tag['address']})['value'],12)
                    service.act({'tag':tag['id'],'action':'set','value':45})
                    self.assertEqual(service.drivers['yak'].read(tag['address']),45)
                    service.edit_tag({'id':tag['id'],'name':'Renamed'})
                    self.assertEqual(next(t for t in service.tags() if t['id']==tag['id'])['name'],'Tag 7')
                    old=service.drivers['yak'];settings={**old.settings,'live':1}
                    service.edit_source({'id':'yak','settings':settings});self.assertIs(service.drivers['yak'],old)
                    self.assertTrue(service.browse_source({'source':'yak'})['items'][12]['added'])
                    self.assertEqual(service.test_source({'id':'yak'})['tag_count'],9)
                    device.revision=2
                    fresh=next(item for item in service.browse_source({'source':'yak','refresh':True})['items'] if item['reference']==7)
                    self.assertTrue(fresh['added'])  # A revision change does not offer duplicate imports.
                    service.edit_tag({'id':tag['id'],'name':'Renamed','address':fresh['address']})
                    tag=next(t for t in service.tags() if t['id']==tag['id'])
                    self.assertEqual(tag['address'],fresh['address'])
                    self.assertEqual(device.opens,1)  # Refresh/rebind does not reset the board.
                finally:
                    for driver in service.drivers.values():driver.close()
                service=Service(Store(Path(folder)/'hmi.sqlite3'))
                try:
                    self.assertEqual(service.drivers['yak'].read(tag['address']),45)
                finally:
                    for driver in service.drivers.values():driver.close()
