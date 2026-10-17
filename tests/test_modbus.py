import importlib.util,socketserver,struct,tempfile,threading,unittest
from pathlib import Path
from unittest.mock import patch
from hmi.modbus import ModbusTCPDriver,modbus_settings,parse_address,encode_registers,decode_registers
from hmi.service import Service
from hmi.store import Store
class Response:
 def __init__(self,registers=None,bits=None,error=False):self.registers=registers or [];self.bits=bits or [];self.error=error
 def isError(self):return self.error
 def __str__(self):return 'Illegal data address'
class FakeClient:
 def __init__(self,*args,**kwargs):self.connected=False;self.calls=[];self.fail=False;self.error=False
 def connect(self):self.connected=not self.fail;return self.connected
 def close(self):self.connected=False
 def read_holding_registers(self,address,*,count,device_id):
  self.calls.append((address,count,device_id));return Response(registers=list(range(address,address+count)),error=self.error)
 read_input_registers=read_holding_registers
 def read_coils(self,address,*,count,device_id):return Response(bits=[True]*count,error=self.error)
 read_discrete_inputs=read_coils
 def write_register(self,address,value,*,device_id):self.calls.append((address,value,device_id));return Response(error=self.error)
 write_registers=write_register
 write_coil=write_register
class ModbusTests(unittest.TestCase):
 def driver(self):return ModbusTCPDriver({'host':'localhost'},FakeClient)
 def test_settings_addresses(self):
  self.assertEqual(modbus_settings({'host':'x','unit_id':'7'})['unit_id'],7)
  for data in [{'host':''},{'host':'x','port':1.5},{'host':'x','timeout':'nan'},{'host':'x','unit_id':256}]:
   with self.assertRaises(ValueError):modbus_settings(data)
  for address in ['holding:65535:float32:big:big','coil:0:uint16:big:big','holding:-1:uint16:big:big','holding:0:bool:big:big']:
   with self.assertRaises(ValueError):parse_address(address)
 def test_formats_orders(self):
  for dtype,value in [('uint16',65535),('int16',-32768),('uint32',4294967295),('int32',-123456),('float32',12.5),('float64',12.123456789)]:
   for byte in ['big','little']:
    for word in ['big','little']:self.assertEqual(decode_registers(encode_registers(value,dtype,byte,word),dtype,byte,word),value)
  self.assertEqual(encode_registers(0x11223344,'uint32','big','little'),[0x3344,0x1122])
  self.assertEqual(encode_registers(0x11223344,'uint32','little','big'),[0x2211,0x4433])
 def test_invalid_writes(self):
  for value in [1.2,65536,-1,float('nan'),'1']:
   with self.assertRaises(ValueError):encode_registers(value,'uint16','big','big')
  with self.assertRaises(ValueError):decode_registers([0x7f80,0],'float32','big','big')
 def test_batches(self):
  d=self.driver();addresses=['holding:0:uint16:big:big','holding:1:int16:big:big','holding:3:uint16:big:big']
  self.assertTrue(all(s['quality']=='good' for s in d.read_many(addresses).values()));self.assertEqual(d.client.calls,[(0,2,1),(3,1,1)])
  d.client.calls=[];d.read_many([f'holding:{i}:uint16:big:big' for i in range(130)]);self.assertEqual([c[1] for c in d.client.calls],[125,5])
 def test_fault_reconnect_readonly(self):
  d=self.driver();d.client.fail=True;self.assertEqual(d.read_many(['holding:0:uint16:big:big'])['holding:0:uint16:big:big']['quality'],'bad')
  d.client.fail=False;self.assertEqual(d.read('holding:0:uint16:big:big'),0)
  d.client.error=True
  with self.assertRaisesRegex(ValueError,'rejected'):d.write('holding:0:uint16:big:big',1)
  d.client.error=False;d.write('holding:0:uint16:big:big',1);self.assertEqual(d.status()['quality'],'good')
  for address in ['input:0:uint16:big:big','discrete:0:bool:big:big']:
   with self.assertRaisesRegex(ValueError,'read only'):d.write(address,1)
  with self.assertRaises(ValueError):d.write('coil:0:bool:big:big',2)
  d.close()
  with self.assertRaisesRegex(ValueError,'closed'):d.read('holding:0:uint16:big:big')
 def test_timeout_stops_other_requests_in_batch(self):
  d=self.driver();calls=[]
  def fail(*args,**kwargs):calls.append(args);raise TimeoutError('Timed out')
  d.client.read_holding_registers=fail
  samples=d.read_many(['holding:0:uint16:big:big','holding:4:uint16:big:big','input:0:uint16:big:big'])
  self.assertEqual(len(calls),1);self.assertFalse(d.client.connected);self.assertTrue(all(s['quality']=='bad' for s in samples.values()))
 def test_device_exception_does_not_block_other_area(self):
  d=self.driver();d.client.read_holding_registers=lambda *args,**kwargs:Response(error=True)
  samples=d.read_many(['holding:0:uint16:big:big','input:0:uint16:big:big'])
  self.assertEqual(samples['holding:0:uint16:big:big']['quality'],'bad');self.assertEqual(samples['input:0:uint16:big:big']['quality'],'good')
 def test_service_identity_and_polling(self):
  with tempfile.TemporaryDirectory() as folder,patch('hmi.service.DRIVERS',{'modbus':lambda settings:ModbusTCPDriver(settings,FakeClient)}):
   s=Service(Store(Path(folder)/'test.sqlite3'));s.add_source({'id':'s','name':'Modbus','kind':'modbus','settings':{'host':'device'}})
   s.add_tag({'id':'t','source':'s','name':'Speed','address':'holding:0000:uint16:big:big'});s.polling.poll_due(asynchronous=False);self.assertEqual(s.values()['t']['value'],0)
   self.assertEqual(s.tags()[0]['data_type'],'UINT16');original=s.drivers['s']
   s.edit_source({'id':'s','settings':{'host':'device','live':1}});self.assertIs(s.drivers['s'],original)
   s.edit_tag({'id':'t','name':'New Speed','address':'holding:3:int16:big:big'});self.assertEqual(s.tags()[0]['id'],'t');self.assertEqual(s.tags()[0]['data_type'],'INT16')
   s.edit_source({'id':'s','settings':{'host':'other'}});self.assertIsNot(s.drivers['s'],original);self.assertTrue(original.closed);s.drivers['s'].close()
class ModbusPeer(socketserver.BaseRequestHandler):
 def exact(self,n):
  result=b''
  while len(result)<n:
   chunk=self.request.recv(n-len(result))
   if not chunk:return None
   result+=chunk
  return result
 def handle(self):
  while True:
   header=self.exact(7)
   if not header:return
   transaction,protocol,length,unit=struct.unpack('>HHHB',header);pdu=self.exact(length-1)
   if not pdu:return
   function=pdu[0];address=struct.unpack('>H',pdu[1:3])[0];self.server.units.append(unit)
   if address==999:reply=bytes([function|0x80,2])
   elif function in (3,4):
    count=struct.unpack('>H',pdu[3:5])[0];data=b''.join(struct.pack('>H',self.server.registers.get(address+i,0)) for i in range(count));reply=bytes([function,len(data)])+data
   elif function in (1,2):reply=bytes([function,1,1])
   elif function==6:self.server.registers[address]=struct.unpack('>H',pdu[3:5])[0];reply=pdu
   elif function==5:reply=pdu
   elif function==16:
    count=struct.unpack('>H',pdu[3:5])[0]
    for i in range(count):self.server.registers[address+i]=struct.unpack('>H',pdu[6+i*2:8+i*2])[0]
    reply=pdu[:5]
   else:reply=bytes([function|0x80,1])
   self.request.sendall(struct.pack('>HHHB',transaction,protocol,len(reply)+1,unit)+reply)
@unittest.skipUnless(importlib.util.find_spec('pymodbus'),'Optional dependency not installed')
class ModbusSocketTests(unittest.TestCase):
 def test_real_tcp(self):
  with socketserver.ThreadingTCPServer(('127.0.0.1',0),ModbusPeer) as server:
   server.registers={0:123};server.units=[];thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   d=ModbusTCPDriver({'host':'127.0.0.1','port':server.server_address[1],'unit_id':7,'timeout':.2})
   try:
    d.test();self.assertEqual(d.read('holding:0:uint16:big:big'),123)
    for area in ['coil','discrete']:self.assertEqual(d.read(f'{area}:0:bool:big:big'),1)
    self.assertEqual(d.read('input:0:uint16:big:big'),123)
    d.write('holding:0:uint16:big:big',432);self.assertEqual(d.read('holding:0:uint16:big:big'),432)
    d.write('holding:2:float32:little:little',12.5);self.assertEqual(d.read('holding:2:float32:little:little'),12.5)
    d.write('coil:0:bool:big:big',0)
    with self.assertRaisesRegex(ValueError,'rejected'):d.read('holding:999:uint16:big:big')
    self.assertEqual(set(server.units),{7})
   finally:d.close();server.shutdown();thread.join()
