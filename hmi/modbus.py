"""Modbus TCP/RTU: zero-based addresses, batched reads and shared serial buses."""
import math
import struct
import threading

AREAS = {'coil':'read_coils', 'discrete':'read_discrete_inputs', 'holding':'read_holding_registers', 'input':'read_input_registers'}
FORMATS = {'uint16':'H','int16':'h','uint32':'I','int32':'i','float32':'f','float64':'d'}


def modbus_settings(data):
    transport=str(data.get('transport','tcp')).strip().lower()
    if transport not in ('tcp','rtu'):raise ValueError('Choose Modbus TCP or RTU')
    result={'transport':transport}
    if transport=='tcp':
        result['host']=str(data.get('host','')).strip()
        if not result['host']:raise ValueError('Device host is required')
    else:
        result['serial_port']=str(data.get('serial_port','')).strip()
        if not result['serial_port'] or len(result['serial_port'])>500 or '\x00' in result['serial_port'] or '://' in result['serial_port']:
            raise ValueError('Serial port is required (COM3 or /dev/ttyUSB0)')
        result['parity']=str(data.get('parity','N')).upper()
        if result['parity'] not in ('N','E','O'):raise ValueError('Parity must be None, Even or Odd')
        echo=data.get('handle_local_echo',False)
        if echo not in (True,False,'true','false'):raise ValueError('Invalid local echo setting')
        result['handle_local_echo']=echo is True or echo=='true'
    fields=[('unit_id',1,1 if transport=='rtu' else 0,247 if transport=='rtu' else 255),
            ('timeout',.5 if transport=='rtu' else 3,.1,60),('live',.5,.1,60),('background',20,.1,60)]
    fields += [('port',502,1,65535)] if transport=='tcp' else [('baudrate',19200,300,1000000),('stopbits',1,1,2),('offline_retry',5,1,300),('startup_delay',0,0,60)]
    for key,default,low,high in fields:
        try:value=float(data.get(key,default))
        except (TypeError,ValueError):raise ValueError('Invalid Modbus '+key) from None
        integer=key in ('port','unit_id','baudrate','stopbits')
        if not math.isfinite(value) or not low<=value<=high or (integer and value!=int(value)):raise ValueError('Invalid Modbus '+key)
        result[key]=int(value) if integer else value
    return result


def parse_address(address):
    # area:offset:format:byte-order:word-order; orders explicitly stored per tag.
    parts=str(address).strip().lower().split(':')
    if len(parts)!=5:raise ValueError('Invalid Modbus address; use area:offset:type:byte-order:word-order')
    area,offset,dtype,byte,word=parts
    if area not in AREAS or byte not in ('big','little') or word not in ('big','little'):raise ValueError('Invalid Modbus area or byte/word order')
    if not offset.isascii() or not offset.isdigit():raise ValueError('Modbus offset must be a whole number from 0 to 65535')
    offset=int(offset)
    if area in ('coil','discrete'):
        if dtype!='bool':raise ValueError('Coils and discrete inputs require BOOL')
        count=1
    else:
        if dtype not in FORMATS:raise ValueError('Choose a supported Modbus register data type')
        count=struct.calcsize('>'+FORMATS[dtype])//2
    if offset<0 or offset+count>65536:raise ValueError('Modbus value extends beyond address 65535')
    return area,offset,dtype,byte,word,count


def canonical_address(address):
    area,offset,dtype,byte,word,_=parse_address(address)
    if dtype=='bool':byte=word='big'
    return f'{area}:{offset}:{dtype}:{byte}:{word}'


def decode_registers(registers,dtype,byte,word):
    chunks=[int(value).to_bytes(2,'big') for value in registers]
    if word=='little':chunks.reverse()
    if byte=='little':chunks=[chunk[::-1] for chunk in chunks]
    value=struct.unpack('>'+FORMATS[dtype],b''.join(chunks))[0]
    if not math.isfinite(value):raise ValueError('Device returned a non-finite number')
    return value


def encode_registers(value,dtype,byte,word):
    if isinstance(value,bool):value=int(value)
    if not isinstance(value,(int,float)) or not math.isfinite(value):raise ValueError('Write requires a finite number')
    if dtype.startswith(('int','uint')):
        if value!=int(value):raise ValueError('Integer register requires a whole number')
        value=int(value)
    try:raw=struct.pack('>'+FORMATS[dtype],value)
    except (OverflowError,struct.error):raise ValueError('Value is outside the '+dtype+' range') from None
    chunks=[raw[i:i+2] for i in range(0,len(raw),2)]
    if byte=='little':chunks=[chunk[::-1] for chunk in chunks]
    if word=='little':chunks.reverse()
    return [int.from_bytes(chunk,'big') for chunk in chunks]


class ModbusDeviceError(ValueError):
    pass


class ModbusTCPDriver:
    def __init__(self,settings,client_factory=None,clock=None,replacing=None):
        self.settings=modbus_settings(settings);self.lock=threading.RLock()
        self.closed=False;self.client=None;self.bus=None;self.quality='idle';self.message='Waiting for first poll'
        self.read_requests=0;self.write_requests=0
        rtu=self.settings['transport']=='rtu'
        if client_factory is None:
            try:
                from pymodbus.client import ModbusTcpClient,ModbusSerialClient
                if rtu:import serial
            except ImportError:raise ValueError('Install Modbus support: python -m pip install -r requirements-modbus.txt') from None
            client_factory=ModbusSerialClient if rtu else ModbusTcpClient
        self.client_factory=client_factory
        self.clock=clock
        if rtu:
            from .modbus_serial import acquire_bus
            self.bus=acquire_bus(self.settings,client_factory,replacing=replacing,**({'clock':clock} if clock else {}))
            self.client=self.bus.client
        else:
            self.client=client_factory(self.settings['host'],port=self.settings['port'],timeout=self.settings['timeout'],retries=0)

    def replacement(self,settings):
        with self.lock:
            factory=self.client_factory if settings.get('transport','tcp')==self.settings['transport'] else None
            return type(self)(settings,factory,self.clock,replacing=self.bus)

    def _request(self,operation):
        if self.closed:raise ValueError('Modbus source is closed')
        if self.bus:
            return self.bus.execute(self.settings['unit_id'],self.settings['offline_retry'],operation,ModbusDeviceError)
        return operation()

    def _connect(self):
        if self.closed:raise ValueError('Modbus source is closed')
        if self.bus:self.bus.connect()
        elif not self.client.connected and not self.client.connect():raise ValueError('Unable to connect to Modbus device')

    @staticmethod
    def _check(response):
        if response is None:raise ValueError('No Modbus response')
        if isinstance(response,Exception):raise ValueError(str(response))
        if response.isError():raise ModbusDeviceError('Modbus device rejected request: '+str(response))
        return response

    def _fault(self,error):
        self.quality='bad';self.message=str(error)
        # Close stale sockets; the next scheduled request reconnects.
        if not self.bus:self.client.close()

    def describe(self,address):
        area,_,dtype,_,_,_=parse_address(address)
        return {'type':dtype.upper(),'writable':area in ('coil','holding')}

    def browse(self):return []

    def test(self):
        with self.lock:
            try:
                if self.bus:self.bus.execute(None,0,self._connect,ModbusDeviceError)
                else:self._connect()
            except Exception as error:self._fault(error);raise ValueError(str(error)) from None
            if self.bus:
                message='Serial port opened; device responses are verified during tag polling'
            else:
                self.quality='good';message='TCP connected (register reads are verified during polling)'
            self.message=message
            return {'message':message}

    def status(self):
        # Health reads must not wait behind a serial timeout.
        result={'quality':self.quality,'message':self.message,'read_requests':self.read_requests,'write_requests':self.write_requests}
        if self.bus:
            result.update(self.bus.diagnostics(self.settings['unit_id']))
            if result['startup_remaining_seconds']>0:result.update(quality='idle',message='Starting: waiting for serial device startup')
        return result

    def read_many(self,addresses):
        result={};entries=[];errors=[]
        for address in dict.fromkeys(addresses):
            try:entries.append((address,parse_address(address)))
            except ValueError as error:result[address]={'value':None,'quality':'bad','error':str(error)};errors.append(str(error))
        groups=[]
        for entry in sorted(entries,key=lambda entry:(entry[1][0],entry[1][1])):
            _,(area,start,_,_,_,count)=entry;limit=2000 if area in ('coil','discrete') else 125
            if groups and groups[-1][0]==area and start<=groups[-1][2] and start+count-groups[-1][1]<=limit:
                groups[-1][2]=max(groups[-1][2],start+count);groups[-1][3].append(entry)
            else:groups.append([area,start,start+count,[entry]])
        with self.lock:
            connection_error=None
            for area,start,end,group in groups:
                try:
                    if connection_error:raise ValueError(connection_error)
                    def read_group():
                        self._connect();self.read_requests+=1
                        response=self._check(getattr(self.client,AREAS[area])(start,count=end-start,device_id=self.settings['unit_id']))
                        values=response.bits if area in ('coil','discrete') else response.registers
                        if len(values)<end-start:raise ValueError('Incomplete Modbus response')
                        return values
                    values=self._request(read_group)
                except Exception as error:
                    message=str(error);errors.append(message)
                    # Device exceptions should not prevent independent areas from reading.
                    if not isinstance(error,ModbusDeviceError):
                        if not self.bus:self.client.close()
                        connection_error=message
                    for address,_ in group:result[address]={'value':None,'quality':'bad','error':message}
                    continue
                for address,(_,offset,dtype,byte,word,count) in group:
                    try:
                        value=int(bool(values[offset-start])) if dtype=='bool' else decode_registers(values[offset-start:offset-start+count],dtype,byte,word)
                        result[address]={'value':value,'quality':'good','error':''}
                    except Exception as error:
                        result[address]={'value':None,'quality':'bad','error':str(error)};errors.append(str(error))
            if errors:self.quality='bad';self.message=errors[0]
            elif entries:self.quality='good';self.message='Connected'
        return result

    def read(self,address):
        sample=self.read_many([address])[address]
        if sample['quality']!='good':raise ValueError(sample['error'])
        return sample['value']

    def write(self,address,value):
        area,offset,dtype,byte,word,_=parse_address(address)
        if area in ('discrete','input'):raise ValueError('Modbus '+area+' values are read only')
        if dtype=='bool':
            if not isinstance(value,(int,float,bool)) or value not in (0,1):raise ValueError('Coil write requires 0 or 1')
            registers=None
        else:registers=encode_registers(value,dtype,byte,word)
        with self.lock:
            try:
                def write_value():
                    self._connect();self.write_requests+=1;args={'device_id':self.settings['unit_id']}
                    if dtype=='bool':response=self.client.write_coil(offset,bool(value),**args)
                    elif len(registers)==1:response=self.client.write_register(offset,registers[0],**args)
                    else:response=self.client.write_registers(offset,registers,**args)
                    return self._check(response)
                self._request(write_value);self.quality='good';self.message='Connected'
            except ModbusDeviceError as error:
                # The device answered; a rejected write does not break the connection.
                raise ValueError(str(error)) from None
            except Exception as error:self._fault(error);raise ValueError(str(error)) from None

    def close(self):
        with self.lock:
            if self.closed:return
            self.closed=True
            if self.bus:
                from .modbus_serial import release_bus
                release_bus(self.bus)
            else:self.client.close()
            self.quality='idle';self.message='Closed'
