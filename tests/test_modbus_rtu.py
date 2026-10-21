import threading
import unittest
from unittest.mock import patch
from hmi.modbus import ModbusTCPDriver,modbus_settings,ModbusDeviceError
from hmi.modbus_serial import port_key

class Response:
    def __init__(self,registers=(),error=False):self.registers=list(registers);self.bits=[True]*len(self.registers);self.error=error
    def isError(self):return self.error
    def __str__(self):return 'Illegal register'

class SerialClient:
    instances=[]
    def __init__(self,**settings):
        self.settings=settings;self.connected=False;self.calls=[];self.fail_units=set();self.errors=set();self.closes=0
        self.block=None;self.entered=threading.Event();self.active=0;self.max_active=0
        self.__class__.instances.append(self)
    def connect(self):self.connected=True;return True
    def close(self):self.closes+=1;self.connected=False
    def read_holding_registers(self,address,*,count,device_id):
        self.active+=1;self.max_active=max(self.max_active,self.active)
        try:
            self.calls.append((device_id,address,count))
            if self.block and not self.entered.is_set():
                self.entered.set();self.block.wait(3)
            if device_id in self.fail_units:raise TimeoutError('Device did not respond')
            return Response(range(address,address+count),device_id in self.errors)
        finally:self.active-=1
    read_input_registers=read_holding_registers
    read_coils=read_holding_registers
    read_discrete_inputs=read_holding_registers
    def write_register(self,address,value,*,device_id):return self.read_holding_registers(address,count=1,device_id=device_id)
    write_coil=write_register
    write_registers=write_register

class RTUTests(unittest.TestCase):
    def setUp(self):self.drivers=[];self.clock=[0.0]
    def tearDown(self):
        for driver in self.drivers:driver.close()
    def driver(self,unit=1,**settings):
        driver=ModbusTCPDriver({'transport':'rtu','serial_port':'COM901','unit_id':unit,**settings},SerialClient,clock=lambda:self.clock[0])
        self.drivers.append(driver);return driver
    def test_settings_and_canonical_ports(self):
        self.assertEqual(port_key('com0901'),port_key('COM901'))
        self.assertEqual(port_key(r'\\.\COM901'),port_key('COM901'))
        result=modbus_settings({'transport':'rtu','serial_port':'COM3'})
        self.assertEqual(result['timeout'],.5);self.assertNotIn('host',result)
        for changes in [{'unit_id':0},{'unit_id':248},{'baudrate':1},{'baudrate':9600.5},{'parity':'x'},{'stopbits':1.5},{'offline_retry':0},{'serial_port':'socket://host:1'},{'serial_port':''}]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):modbus_settings({'transport':'rtu','serial_port':'COM3',**changes})
    def test_startup_delay_validation_and_default(self):
        settings=modbus_settings({'transport':'rtu','serial_port':'COM3'})
        self.assertEqual(settings['startup_delay'],0)
        for value in (-1,61,float('nan'),float('inf'),'oops'):
            with self.subTest(value=value),self.assertRaises(ValueError):
                modbus_settings({**settings,'startup_delay':value})
        self.assertNotIn('startup_delay',modbus_settings({'host':'localhost','startup_delay':2}))

    def test_delay_once_per_shared_port_open_and_again_after_reconnect(self):
        one=self.driver(startup_delay=2);two=self.driver(2,startup_delay=2)
        def settle(seconds):
            self.assertEqual(one.client.calls,[])
            self.assertEqual(one.status()['message'],'Starting: waiting for serial device startup')
            self.clock[0]+=seconds
        with patch('hmi.modbus_serial.time.sleep',side_effect=settle) as sleep:
            self.assertEqual(one.read('holding:0:uint16:big:big'),0)
            self.assertEqual(two.read('holding:1:uint16:big:big'),1)
            one.test()
            sleep.assert_called_once_with(2)
        one.client.close()
        with patch('hmi.modbus_serial.time.sleep') as sleep:
            self.assertEqual(two.read('holding:2:uint16:big:big'),2)
            sleep.assert_called_once_with(2)
        with self.assertRaisesRegex(ValueError,'startup delay'):self.driver(3,startup_delay=0)

    def test_default_does_not_sleep(self):
        one=self.driver()
        with patch('hmi.modbus_serial.time.sleep') as sleep:
            self.assertEqual(one.read('holding:0:uint16:big:big'),0)
            sleep.assert_not_called()

    def test_waiting_port_does_not_block_other_ports_or_status(self):
        one=self.driver(startup_delay=2)
        other=ModbusTCPDriver({'transport':'rtu','serial_port':'COM902'},SerialClient)
        self.drivers.append(other)
        entered=threading.Event();release=threading.Event();output={}
        def wait(seconds):entered.set();release.wait(2)
        with patch('hmi.modbus_serial.time.sleep',side_effect=wait):
            thread=threading.Thread(target=lambda:output.update(value=one.read('holding:0:uint16:big:big')))
            thread.start()
            try:
                self.assertTrue(entered.wait(1))
                self.assertEqual(other.read('holding:1:uint16:big:big'),1)
                self.assertEqual(one.status()['startup_remaining_seconds'],2)
            finally:release.set();thread.join(2)
        self.assertEqual(output['value'],0)

    def test_replace_single_source_bus_settings_preserves_identity_workflow(self):
        one=self.driver();one.read('holding:0:uint16:big:big');old=one.client
        replacement=one.replacement({**one.settings,'baudrate':9600})
        self.drivers.append(replacement);one.close()
        self.assertEqual(old.closes,1)
        self.assertEqual(replacement.client.settings['baudrate'],9600)
        self.assertEqual(replacement.read('holding:1:uint16:big:big'),1)
        self.driver(2,baudrate=9600)
        with self.assertRaisesRegex(ValueError,'same baud'):
            replacement.replacement({**replacement.settings,'baudrate':19200})

    def test_one_client_and_reference_counted_close(self):
        one=self.driver();two=self.driver(2,serial_port='com0901')
        self.assertIs(one.client,two.client);self.assertEqual(one.client.settings['retries'],0)
        self.assertEqual(one.status()['serial_sources'],2)
        one.read('holding:0:uint16:big:big');one.close();one.close()
        self.assertEqual(two.client.closes,0)
        self.assertEqual(two.read('holding:4:uint16:big:big'),4)
        two.close();self.assertEqual(two.client.closes,1)
    def test_conflicting_settings_rejected_without_touching_bus(self):
        one=self.driver();one.read('holding:0:uint16:big:big')
        for changes in [{'baudrate':9600},{'parity':'E'},{'timeout':1},{'stopbits':2},{'handle_local_echo':True}]:
            with self.subTest(changes=changes),self.assertRaisesRegex(ValueError,'same baud'):self.driver(2,**changes)
        self.assertTrue(one.client.connected)
    def test_offline_backoff_is_per_unit_and_shared_by_duplicate_sources(self):
        bad=self.driver();duplicate=self.driver();healthy=self.driver(2);client=bad.client;client.fail_units.add(1)
        addresses=['holding:0:uint16:big:big','holding:10:uint16:big:big','input:0:uint16:big:big']
        result=bad.read_many(addresses)
        self.assertTrue(all(sample['quality']=='bad' for sample in result.values()));self.assertEqual(len(client.calls),1)
        for _ in range(10):duplicate.read_many(addresses)
        self.assertEqual(len(client.calls),1)
        self.assertEqual(healthy.read('holding:7:uint16:big:big'),7)
        self.assertEqual(bad.status()['retry_after_seconds'],5)
        self.clock[0]=5;bad.read_many(addresses);self.assertEqual(len(client.calls),3)
        self.assertEqual(bad.status()['retry_after_seconds'],10)
        self.clock[0]=15;client.fail_units.clear();self.assertEqual(bad.read('holding:0:uint16:big:big'),0)
        self.assertEqual(bad.status()['retry_after_seconds'],0)
    def test_device_errors_and_invalid_writes_do_not_close_shared_port(self):
        one=self.driver();client=one.client
        with self.assertRaisesRegex(ValueError,'whole number'):one.write('holding:0:uint16:big:big',1.5)
        self.assertEqual(client.calls,[])
        client.errors.add(1);result=one.read_many(['holding:0:uint16:big:big','input:0:uint16:big:big'])
        self.assertEqual(len(client.calls),2);self.assertEqual(client.closes,0);self.assertEqual(one.status()['retry_after_seconds'],0)
        with self.assertRaisesRegex(ValueError,'rejected'):one.write('holding:0:uint16:big:big',1)
        self.assertEqual(client.closes,0)
    def test_fifo_yields_between_groups_and_status_does_not_wait(self):
        one=self.driver();two=self.driver(2);client=one.client;client.block=threading.Event()
        output={}
        first=threading.Thread(target=lambda:output.update(one=one.read_many(['holding:0:uint16:big:big','holding:10:uint16:big:big'])))
        second=threading.Thread(target=lambda:output.update(two=two.read('holding:20:uint16:big:big')))
        first.start();self.assertTrue(client.entered.wait(2));second.start()
        try:
            with one.bus.condition:self.assertTrue(one.bus.condition.wait_for(lambda:len(one.bus.queue)==1,2))
            self.assertTrue(one.status()['bus_busy'])
        finally:
            client.block.set();first.join(3);second.join(3)
        self.assertFalse(first.is_alive());self.assertFalse(second.is_alive())
        self.assertEqual([call[0] for call in client.calls],[1,2,1]);self.assertEqual(client.max_active,1)
        self.assertEqual(output['two'],20)
    def test_test_connection_opens_port_without_claiming_device_online(self):
        one=self.driver();self.assertIn('device responses',one.test()['message'])
        self.assertEqual(one.client.calls,[]);self.assertEqual(one.status()['quality'],'idle')
        one.read('holding:0:uint16:big:big');self.assertEqual(one.status()['quality'],'good')

# Exercise real PyModbus RTU frames and pySerial over a local serial tunnel.
# This is a test peer, not a replacement for testing an RS-485 adapter on hardware.
import importlib.util
import socketserver
import struct

class RTUPeer(socketserver.BaseRequestHandler):
    def exact(self,size):
        data=b''
        while len(data)<size:
            chunk=self.request.recv(size-len(data))
            if not chunk:return None
            data+=chunk
        return data
    def handle(self):
        from pymodbus.framer.rtu import FramerRTU
        while True:
            head=self.exact(2)
            if not head:return
            unit,function=head
            if function==16:
                rest=self.exact(5)
                if not rest:return
                payload=self.exact(rest[4]+2)
                if payload is None:return
                frame=head+rest+payload
            else:
                rest=self.exact(6)
                if not rest:return
                frame=head+rest
            if not FramerRTU.check_CRC(frame[:-2],int.from_bytes(frame[-2:],'big')):return
            self.server.units.append(unit)
            if unit==2:continue  # Offline slave: do not answer.
            address=int.from_bytes(frame[2:4],'big')
            if address==999:reply=bytes([unit,function|0x80,2])
            elif function in (3,4):
                count=int.from_bytes(frame[4:6],'big')
                values=b''.join(struct.pack('>H',self.server.registers.get(address+i,0)) for i in range(count))
                reply=bytes([unit,function,len(values)])+values
            elif function in (1,2):reply=bytes([unit,function,1,1])
            elif function==6:
                self.server.registers[address]=int.from_bytes(frame[4:6],'big');reply=frame[:6]
            elif function==5:reply=frame[:6]
            elif function==16:
                count=int.from_bytes(frame[4:6],'big')
                for index in range(count):self.server.registers[address+index]=int.from_bytes(frame[7+index*2:9+index*2],'big')
                reply=frame[:6]
            else:reply=bytes([unit,function|0x80,1])
            self.request.sendall(reply+FramerRTU.compute_CRC(reply).to_bytes(2,'big'))

@unittest.skipUnless(importlib.util.find_spec('pymodbus') and importlib.util.find_spec('serial'),'Optional PyModbus/pySerial dependencies not installed')
class RTUFrameTests(unittest.TestCase):
    def test_real_serial_framing_writes_and_offline_isolation(self):
        from pymodbus.client import ModbusSerialClient
        with socketserver.ThreadingTCPServer(('127.0.0.1',0),RTUPeer) as server:
            server.units=[];server.registers={0:123}
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            def factory(**settings):
                settings['port']=f'socket://127.0.0.1:{server.server_address[1]}'
                return ModbusSerialClient(**settings)
            settings={'transport':'rtu','serial_port':'COM902','timeout':.2}
            clock=[0.0]
            one=ModbusTCPDriver(settings,factory,clock=lambda:clock[0])
            offline=ModbusTCPDriver({**settings,'unit_id':2},factory,clock=lambda:clock[0])
            try:
                self.assertEqual(one.read('holding:0:uint16:big:big'),123)
                one.write('holding:0:uint16:big:big',456);self.assertEqual(one.read('holding:0:uint16:big:big'),456)
                one.write('holding:4:float32:little:little',12.5);self.assertEqual(one.read('holding:4:float32:little:little'),12.5)
                one.write('coil:0:bool:big:big',1);self.assertEqual(one.read('coil:0:bool:big:big'),1)
                with self.assertRaisesRegex(ValueError,'rejected'):one.read('holding:999:uint16:big:big')
                self.assertEqual(one.status()['retry_after_seconds'],0)
                result=offline.read_many(['holding:0:uint16:big:big','input:0:uint16:big:big'])
                self.assertTrue(all(sample['quality']=='bad' for sample in result.values()))
                self.assertEqual(server.units.count(2),1)
                with self.assertRaisesRegex(ValueError,'waiting before retry'):offline.read('holding:0:uint16:big:big')
                self.assertEqual(server.units.count(2),1)
                self.assertEqual(one.read('holding:0:uint16:big:big'),456)
            finally:
                one.close();offline.close();server.shutdown();thread.join()
