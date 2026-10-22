"""LightYak v1 serial driver. One serialized connection per physical port."""
import hashlib
import math
import os
import struct
import threading
import time
from . import lightyak_codec as wire
from .modbus_serial import port_key

_registry = {}
_registry_lock = threading.RLock()


def lightyak_settings(data):
    port = str(data.get('serial_port', '')).strip()
    if not port or len(port)>500 or '\x00' in port or '://' in port:
        raise ValueError('Choose a serial port such as COM6 or /dev/ttyACM0')
    result = {'serial_port':port, 'parity':str(data.get('parity','N')).upper()}
    if result['parity'] not in ('N','E','O'):raise ValueError('Choose None, Even or Odd parity')
    for key, default, low, high in [('baudrate',115200,300,1000000),('stopbits',1,1,2),('timeout',2,.1,60),('startup_delay',2,0,60),('offline_retry',5,1,300),('live',.5,.1,60),('background',20,.1,60)]:
        try:value=float(data.get(key,default))
        except (ValueError,TypeError,OverflowError):raise ValueError('Invalid LightYak '+key) from None
        if not math.isfinite(value) or not low<=value<=high or (key in ('baudrate','stopbits') and value!=int(value)):
            raise ValueError('Invalid LightYak '+key)
        result[key]=int(value) if key in ('baudrate','stopbits') else value
    return result


def tag_address(tag, revision):
    digest=hashlib.sha256(tag.name.encode('utf-8')).hexdigest()[:16]
    return f'{tag.reference}:{tag.property}@{revision}:{tag.type}:{digest}'


def binding_signature(address):
    """Original name hash and scalar type; reference and revision are discovery details."""
    return str(address).partition('@')[2].partition(':')[2]


def validate_value(tag, value):
    if not tag.writable:raise ValueError('LightYak target is read only')
    if tag.type==1:
        if not isinstance(value,(bool,int,float)) or value not in (0,1):raise ValueError('Boolean write requires true/false or 0/1')
        value=bool(value)
    elif tag.type==2 and isinstance(value,str):
        if len(value)!=1 or ord(value)>255:raise ValueError('Character must fit one byte')
    else:
        if not isinstance(value,(int,float)) or (isinstance(value,float) and not math.isfinite(value)):raise ValueError('Write requires a finite number')
        if tag.type!=9:
            if value!=int(value):raise ValueError('Integer write requires a whole number')
            value=int(value)
    try:wire.pack_value(tag.type,value)
    except (OverflowError,struct.error,TypeError):raise ValueError('Value is outside the '+wire.TYPE_NAMES[tag.type]+' range') from None
    return value


class Connection:
    def __init__(self, settings, factory):
        self.settings=dict(settings);self.factory=factory
        self.signature=tuple(settings[k] for k in ('baudrate','parity','stopbits','timeout','startup_delay','offline_retry'))
        self.lock=threading.RLock();self.references=0;self.channel=self.client=None
        self.catalog={};self.identity={};self.quality='idle';self.message='Waiting for first request'
        self.retry_at=0;self.failures=0;self.closed=False;self.read_requests=self.write_requests=0

    def disconnect(self):
        channel=self.channel;self.channel=self.client=None;self.catalog={}
        if channel is not None:
            try:channel.close()
            except OSError:pass

    def fault(self, error):
        self.disconnect();self.failures+=1;self.quality='bad';self.message=str(error)
        self.retry_at=time.monotonic()+max(self.settings['offline_retry'],min(60,self.settings['offline_retry']*2**min(self.failures-1,6)))

    def connect(self):
        if self.closed:raise ValueError('LightYak connection is closed')
        if self.client is not None:return
        if time.monotonic()<self.retry_at:raise ValueError('Waiting before reconnect: '+self.message)
        try:
            args=dict(port=self.settings['serial_port'],baudrate=self.settings['baudrate'],bytesize=8,
                      parity=self.settings['parity'],stopbits=self.settings['stopbits'],timeout=.02,
                      write_timeout=self.settings['timeout'])
            if os.name!='nt':args['exclusive']=True
            self.channel=self.factory(**args)
            if self.settings['startup_delay']:
                self.quality='idle';self.message='Waiting for serial device startup'
                time.sleep(self.settings['startup_delay'])
            self.channel.reset_input_buffer()
            self.client=wire.Client(self.channel,self.settings['timeout'])
            self.refresh_catalog()
        except Exception as error:
            self.fault(error)
            raise ValueError(str(error)) from None

    def refresh_catalog(self):
        self.identity=self.client.identify()
        if self.identity['initialization_status']:raise wire.ProtocolError('Device initialization failed: '+str(self.identity['initialization_status']))
        tags=self.client.browse()
        if len(tags)!=self.identity['tag_count']+6:raise wire.ProtocolError('Catalog count does not match identity')
        expected={1:1,2:4,3:8,4:4,5:4,6:4}
        if {t.property:t.type for t in tags if t.reference==0}!=expected or {t.reference for t in tags if t.reference}!=set(range(1,self.identity['tag_count']+1)):
            raise wire.ProtocolError('Invalid catalog targets')
        self.catalog={tag_address(tag,self.identity['catalog_revision']):tag for tag in tags}
        self.quality='good';self.message='Connected to '+self.identity['device_name'];self.failures=0;self.retry_at=0

    def target(self, address):
        self.connect()
        signature=binding_signature(address)
        matches=[tag for current,tag in self.catalog.items()
                 if signature and binding_signature(current)==signature]
        if len(matches)==1:return matches[0]
        reason='multiple device tags match the original name and type' if matches else 'no device tag matches the original name and type'
        raise ValueError('LightYak tag binding warning: '+reason+'; edit and reselect this tag')


class LightYakDriver:
    def __init__(self, settings, channel_factory=None, replacing=None):
        self.settings=lightyak_settings(settings);self.closed=False
        if channel_factory is None:
            try:from serial import Serial
            except ImportError:raise ValueError('Install LightYak support: python -m pip install -r requirements-lightyak.txt') from None
            channel_factory=Serial
        key=port_key(self.settings['serial_port'])
        signature=tuple(self.settings[k] for k in ('baudrate','parity','stopbits','timeout','startup_delay','offline_retry'))
        with _registry_lock:
            connection=_registry.get(key)
            if connection and connection.signature!=signature:
                if replacing is None or replacing.connection is not connection or connection.references!=1:
                    raise ValueError('LightYak sources sharing a port must use identical serial and timing settings')
                with connection.lock:connection.disconnect();connection.closed=True
                connection=None
            if connection is None:
                connection=Connection(self.settings,channel_factory);_registry[key]=connection
            connection.references+=1;self.connection=connection

    def replacement(self, settings):
        return LightYakDriver(settings, self.connection.factory, replacing=self)

    def _check(self):
        if self.closed:raise ValueError('LightYak source is closed')

    def test(self):
        with self.connection.lock:
            self._check();self.connection.connect()
            return {'message':self.connection.message,'tag_count':self.connection.identity['tag_count']}

    def browse(self, refresh=False):
        with self.connection.lock:
            self._check()
            connected=self.connection.client is not None
            self.connection.connect()
            if refresh and connected:
                try:self.connection.refresh_catalog()
                except Exception as error:
                    self.connection.fault(error)
                    raise ValueError(str(error)) from None
            return [{'address':address,'name':tag.name,'type':wire.TYPE_NAMES[tag.type].upper(),
                     'writable':tag.writable,'reference':tag.reference,'property':tag.property}
                    for address,tag in self.connection.catalog.items()]

    def browse_catalog(self, refresh=False):
        with self.connection.lock:
            items=self.browse(refresh)
            return {'device_name':self.connection.identity['device_name'], 'items':items}

    def describe(self, address):
        with self.connection.lock:
            self._check();tag=self.connection.target(address)
            return {'name':tag.name,'type':wire.TYPE_NAMES[tag.type].upper(),'writable':tag.writable}

    def read_many(self, addresses):
        result={};connection=self.connection
        with connection.lock:
            self._check()
            try:connection.connect()
            except ValueError as error:return {a:{'value':None,'quality':'bad','error':str(error)} for a in addresses}
            valid=[]
            for address in dict.fromkeys(addresses):
                try:valid.append((address,connection.target(address)))
                except ValueError as error:result[address]={'value':None,'quality':'bad','error':str(error)}
            # Reserve one of the six slots for Catalog Revision. This detects a
            # reboot/reflash even when the serial port itself stays open.
            batch_size=wire.MAX_BATCH-1
            for start in range(0,len(valid),batch_size):
                batch=valid[start:start+batch_size]
                try:
                    connection.read_requests+=1
                    samples=connection.client.read([(0,3)]+[tag.target for _,tag in batch])
                    revision=samples.pop(0)
                    if revision['status'] or revision['type']!=8:
                        raise wire.ProtocolError('Catalog revision unavailable')
                    if revision['value']!=connection.identity['catalog_revision']:
                        connection.refresh_catalog()
                        # Discard the samples taken against the previous schema.
                        for address,_ in valid[start:]:
                            result[address]={'value':None,'quality':'bad','error':'Catalog refreshed; waiting for next poll'}
                        break
                    for (address,tag),sample in zip(batch,samples):
                        if sample['status']:result[address]={'value':None,'quality':'bad','error':wire.STATUS_NAMES[sample['status']]};continue
                        if sample['type']!=tag.type:raise wire.ProtocolError('Read type does not match discovered catalog')
                        value=sample['value']
                        if isinstance(value,float) and not math.isfinite(value):
                            result[address]={'value':None,'quality':'bad','error':'Device returned a non-finite number'}
                        else:result[address]={'value':value,'quality':'good','error':''}
                    connection.quality='good';connection.message='Connected to '+connection.identity['device_name']
                except wire.DeviceError as error:
                    if error.status in (7,8):
                        connection.fault(error)
                        for address,_ in valid[start:]:result[address]={'value':None,'quality':'bad','error':str(error)}
                        break
                    for address,_ in batch:result[address]={'value':None,'quality':'bad','error':str(error)}
                except Exception as error:
                    connection.fault(error)
                    for address,_ in valid[start:]:result[address]={'value':None,'quality':'bad','error':str(error)}
                    break
        return result

    def read(self, address):
        sample=self.read_many([address])[address]
        if sample['quality']!='good':raise ValueError(sample['error'])
        return sample['value']

    def write(self, address, value):
        connection=self.connection
        with connection.lock:
            self._check();tag=connection.target(address)
            value=validate_value(tag,value)  # Local errors must not disconnect a healthy device.
            sent=False
            try:
                revision=connection.client.read([(0,3)])[0]
                if revision['status'] or revision['type']!=8:
                    raise wire.ProtocolError('Catalog revision unavailable')
                if revision['value']!=connection.identity['catalog_revision']:
                    connection.refresh_catalog()
                    tag=connection.target(address)
                    value=validate_value(tag,value)
                connection.write_requests+=1
                sent=True
                sample=connection.client.write([(*tag.target,tag.type,value)])[0]
                if sample['status']:raise wire.DeviceError(sample['status'])
            except wire.DeviceError as error:
                if error.status in (7,8):connection.fault(error)
                raise ValueError(str(error)) from None
            except Exception as error:
                connection.fault(error)
                raise ValueError(('Write outcome uncertain; not retried. Read back after reconnecting. ' if sent else 'Write not sent: ')+str(error)) from None

    def status(self):
        c=self.connection
        return {'quality':'idle' if self.closed else c.quality,'message':'Closed' if self.closed else c.message,
                'read_requests':c.read_requests,'write_requests':c.write_requests}

    def close(self):
        with _registry_lock:
            if self.closed:return
            self.closed=True;c=self.connection;c.references-=1
            if not c.references:
                with c.lock:c.disconnect();c.closed=True
                for key,value in list(_registry.items()):
                    if value is c:del _registry[key]
