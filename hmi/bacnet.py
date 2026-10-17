"""BAC0 adapter. Only this module knows its async API and BACnet identifiers."""
import copy
import json
import asyncio
import concurrent.futures
import importlib.util
import ipaddress
import math
import re
import threading
import time

PROPERTIES = {'presentValue': 'PV', 'eventState': 'Event State', 'units': 'Units'}
COMMON_TYPES = {0: 'analog-input', 1: 'analog-output', 2: 'analog-value',
                3: 'binary-input', 4: 'binary-output', 5: 'binary-value',
                8: 'device', 13: 'multi-state-input', 14: 'multi-state-output', 19: 'multi-state-value'}


def bacnet_settings(settings):
    result = dict(settings)
    result['local_ip'] = str(result.get('local_ip', '')).strip()
    if not result['local_ip'] or ipaddress.ip_address(result['local_ip']).version != 4:
        raise ValueError('Choose a local IPv4 network interface for BACnet')
    for key, default, low, high in [('prefix', 24, 1, 32), ('port', 47808, 1, 65535),
            ('device_id', 3056177, 1, 4194302), ('discovery_min', 0, 0, 4194302),
            ('discovery_max', 4194302, 0, 4194302), ('bbmd_ttl', 900, 30, 65535),
            ('write_priority', 16, 1, 16), ('batch_size', 20, 1, 50)]:
        value = float(result.get(key, default))
        if not math.isfinite(value) or not value.is_integer() or not low <= value <= high:
            raise ValueError(f'{key} must be a whole number from {low} to {high}')
        result[key] = int(value)
    for key, default, low, high in [('timeout', 5, .1, 60), ('discovery_timeout', 3, .1, 30),
            ('background', 20, .1, 60), ('live', .5, .1, 60)]:
        value = float(result.get(key, default))
        if not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f'{key} must be from {low} to {high} seconds')
        result[key] = value
    if result['live'] > result['background']:
        raise ValueError('Live polling must be no slower than Background')
    if result['discovery_min'] > result['discovery_max']:
        raise ValueError('Discovery minimum must not exceed maximum')
    for key in ('target', 'bbmd_address'):
        result[key] = str(result.get(key, '')).strip()
        if result[key] and not re.fullmatch(r'[0-9.:*]+', result[key]):
            raise ValueError(f'Invalid {key}: use an IP[:port] or BACnet network:address')
    return result


def parse_address(address):
    match = re.fullmatch(r'(\d+)/(\d+):(\d+)/([A-Za-z][A-Za-z0-9_-]*|\d+)', str(address))
    if not match:
        raise ValueError('Choose a BACnet device, object, and property')
    device, kind, instance = map(int, match.groups()[:3])
    if device > 4194302 or instance > 4194302 or kind > 1023:
        raise ValueError('BACnet identifier is outside its range')
    return device, kind, instance, property_name(match[4])


def property_name(identifier):
    try:
        from bacpypes3.primitivedata import PropertyIdentifier
        return str(PropertyIdentifier(int(identifier) if str(identifier).isdigit() else identifier).attr)
    except ImportError:
        return {'present-value':'presentValue','event-state':'eventState','object-name':'objectName'}.get(str(identifier), str(identifier))


def property_preview(value, depth=0):
    if depth > 5:
        return str(value)[:300]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k):property_preview(v, depth+1) for k,v in list(value.items())[:100]}
    if isinstance(value, (list, tuple)):
        return [property_preview(v, depth+1) for v in value[:100]]
    return str(value)[:2000]


def property_item(node, prop, value):
    if hasattr(value,'errorClass') and hasattr(value,'errorCode'):
        return {'address':f'{node}/{prop}','property':prop,'label':PROPERTIES.get(prop,prop),'available':False,'selectable':False,'error':str(value)}
    item = {'address':f'{node}/{prop}', 'property':prop, 'label':PROPERTIES.get(prop, prop), 'available':True}
    try:
        plain=scalar(value, prop)
        item.update(value=plain, selectable=True, data_type='STRING' if isinstance(plain, str) else 'NUMBER')
    except ValueError:
        item.update(value=None, selectable=False, data_type='COMPLEX', preview=json.dumps(property_preview(value), ensure_ascii=False, indent=2)[:16000])
    return item


def type_name(code):
    try:
        from bacpypes3.primitivedata import ObjectType
        return str(ObjectType(code))
    except ImportError:
        return COMMON_TYPES.get(code, str(code))


def object_label(kind, instance):
    return 'OBJECT_' + type_name(kind).replace('-', '_').upper() + ':' + str(instance)


def path_suffix(address):
    device, kind, instance, prop = parse_address(address)
    return f'{device}\\{object_label(kind, instance)}\\{prop}'


def scalar(value, prop):
    if value is None:
        raise ValueError('Device returned no property value')
    if prop == 'units':
        return str(value)
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return int(value)  # BACnet enums (binary PV/event state) become numeric feedback.
    if isinstance(value, float) and math.isfinite(value):
        return float(value)
    if isinstance(value, str):
        return str(value)
    raise ValueError('Property is not a scalar value')


def transport_error(error):
    return isinstance(error, TimeoutError) or any(token in str(error).lower() for token in ('timeout', 'timed out', 'no response', 'no-response', 'offline', 'refused', 'unreachable'))


class AsyncRuntime:
    """A single event loop for all BAC0 instances; HTTP/polling threads submit work."""
    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self._run, name='bacnet-async', daemon=True)
        self.thread.start()

    def _run(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def call(self, coroutine, timeout):
        future = asyncio.run_coroutine_threadsafe(coroutine, self.loop)
        try:
            return future.result(timeout + 1)
        except (concurrent.futures.TimeoutError, TimeoutError) as error:
            future.cancel()
            raise ValueError('BACnet request timed out') from error


_pool_lock = threading.RLock()
_runtime = None
_sessions = {}
NETWORK_FIELDS = ('local_ip', 'prefix', 'port', 'device_id', 'bbmd_address', 'bbmd_ttl')


class Session:
    def __init__(self, settings, factory):
        self.settings = dict(settings)
        self.factory = factory
        self.client = None
        self.lock = None
        self.users = 0

    async def run(self, operation, timeout):
        if self.lock is None:
            self.lock = asyncio.Lock()
        async with self.lock:
            async def perform():
                if self.client is None:
                    factory = self.factory
                    if factory is None:
                        import BAC0
                        BAC0.log_level('error', log_this=False)
                        factory = BAC0.start
                    s = self.settings
                    options = {'ip': f"{s['local_ip']}/{s['prefix']}", 'port': s['port'],
                               'deviceId': s['device_id'], 'localObjName': 'Python HMI', 'ping': False}
                    if s['bbmd_address']:
                        options.update(bbmdAddress=s['bbmd_address'], bbmdTTL=s['bbmd_ttl'])
                    client = factory(**options)
                    try:
                        await client.__aenter__()
                    except BaseException:
                        try:
                            await client._disconnect()
                        except Exception:
                            pass
                        raise
                    self.client = client
                return await operation(self.client)
            return await asyncio.wait_for(perform(), timeout)

    async def close(self):
        if self.lock is None:
            return
        async with self.lock:
            if self.client is not None:
                client, self.client = self.client, None
                await client._disconnect()


class BACnetDriver:
    def __init__(self, settings, factory=None):
        self.settings = bacnet_settings(settings)
        if factory is None and importlib.util.find_spec('BAC0') is None:
            raise ValueError('Install BAC0: python -m pip install -r requirements-bacnet.txt')
        global _runtime
        self.lock = threading.RLock()
        self.devices, self.objects = {}, {}
        self.property_cache = {}
        self.device_failures = {}
        self.single_property_devices = set()
        self.health = {'quality': 'idle', 'message': 'Waiting for BACnet discovery or polling'}
        self.retry_at = 0
        self.closed = False
        self.session_key = tuple(self.settings[key] for key in NETWORK_FIELDS) + (factory,)
        with _pool_lock:
            if _runtime is None:
                _runtime = AsyncRuntime()
            self.session = _sessions.setdefault(self.session_key, Session(self.settings, factory))
            self.session.users += 1

    def _call(self, operation, timeout=None):
        if self.closed:
            raise ValueError('BACnet source is closed')
        timeout = timeout or max(15, self.settings['timeout'] + 2)
        return _runtime.call(self.session.run(operation, timeout), timeout)

    async def _read(self, client, request, **kwargs):
        if request.endswith(' units') and hasattr(client, 'this_application'):
            # BAC0.read substitutes noUnits for missing units. Use its underlying
            # application here so unavailable properties cannot be imported as real data.
            from bacpypes3.pdu import Address
            from bacpypes3.primitivedata import ObjectIdentifier, PropertyIdentifier
            address, kind, instance, prop = request.split()
            from bacpypes3.apdu import ErrorRejectAbortNack
            async def strict_read():
                try:
                    return await client.this_application.app.read_property(Address(address), ObjectIdentifier((kind, int(instance))), PropertyIdentifier(prop))
                except ErrorRejectAbortNack as error:
                    raise ValueError(str(error)) from error
            operation = strict_read()
        else:
            operation = client.read(request, timeout=self.settings['timeout'], **kwargs)
        value = await asyncio.wait_for(operation, self.settings['timeout'])
        if value is None:
            raise ValueError('No response to ' + request)
        return value

    async def _discover(self, client):
        s = self.settings
        replies = await client.who_is(address=s['target'] or '*', low_limit=s['discovery_min'],
                                     high_limit=s['discovery_max'], timeout=s['discovery_timeout'])
        devices = {}
        for reply in replies:
            identity = int(reply.iAmDeviceIdentifier[1])
            if identity == s['device_id']:
                continue
            address = str(reply.pduSource)
            if identity in devices and devices[identity]['address'] != address:
                raise ValueError(f'Duplicate BACnet device instance {identity}; use a scoped discovery target')
            devices[identity] = {'id': identity, 'address': address, 'name': 'Device ' + str(identity)}
        await self._device_names(client, list(devices.values()))
        self.devices = devices
        self.objects = {}
        self.property_cache.clear()
        return devices

    async def _device_names(self, client, devices):
        async def name(device):
            try:
                device['name'] = str(await self._read(client, f"{device['address']} device {device['id']} objectName"))
                device.pop('error', None)
            except Exception as error:
                device['error'] = str(error)
            finally:
                device['name_attempted'] = True
        # Polling can cache an address before discovery has fetched its Object Name.
        for start in range(0, len(devices), 4):
            await asyncio.gather(*(name(device) for device in devices[start:start + 4]))

    def discover(self, refresh=False):
        if refresh:
            self.device_failures.clear()
        if refresh or not self.devices:
            self._call(self._discover, max(30, self.settings['discovery_timeout'] + self.settings['timeout'] * 20))
        else:
            unnamed = [device for device in self.devices.values() if not device.get('name_attempted')]
            if unnamed:
                self._call(lambda client: self._device_names(client, unnamed), max(30, self.settings['timeout'] * len(unnamed) + 2))
        return self.devices

    async def _device(self, client, identity):
        if identity not in self.devices:
            replies = await client.who_is(address=self.settings['target'] or '*', low_limit=identity,
                                         high_limit=identity, timeout=self.settings['discovery_timeout'])
            matches = {str(reply.pduSource) for reply in replies if int(reply.iAmDeviceIdentifier[1]) == identity}
            if len(matches) != 1:
                raise ValueError(f'BACnet device {identity} not found or has duplicate instance IDs')
            self.devices[identity] = {'id': identity, 'address': matches.pop(), 'name': str(identity)}
        return self.devices[identity]

    async def _objects(self, client, identity):
        device = await self._device(client, identity)
        request = f"{device['address']} device {identity} objectList"
        try:
            objects = await self._read(client, request)
        except Exception:
            count = int(await self._read(client, request, arr_index=0))
            if not 0 <= count <= 100000:
                raise ValueError('Invalid BACnet object list length')
            objects = [await self._read(client, request, arr_index=index) for index in range(1, count + 1)]
        result = []
        for obj in objects:
            kind, instance = int(obj[0]), int(obj[1])
            result.append({'device': identity, 'object_type': kind, 'object_instance': instance,
                           'node': f'{identity}/{kind}:{instance}', 'name': object_label(kind, instance)})
        self.objects[identity] = result
        return result

    def browse(self, node='', offset=0, search='', refresh=False, **unused):
        with self.lock:
            self.retry_at = 0
            try:
                if not node:
                    devices = self.discover(refresh)
                    items = [{'node': str(d['id']), 'name': f"{d['name']} [{d['id']}]", 'children': True,
                              'selectable': False, 'type': 'Device', 'error': d.get('error', '')} for d in sorted(devices.values(), key=lambda d: d['id'])]
                elif re.fullmatch(r'\d+', node):
                    identity = int(node)
                    objects = self._call(lambda client: self._objects(client, identity)) if refresh or identity not in self.objects else self.objects[identity]
                    # Names are loaded only for the visible page of objects.
                    visible = objects[offset:offset + 100]
                    async def names(client):
                        device = await self._device(client, identity)
                        for item in visible:
                            if item['object_type'] == 8:
                                item['name'] = 'Device Properties'
                                item['named'] = True
                            if not item.get('named'):
                                try:
                                    item['name'] = str(await self._read(client, f"{device['address']} {item['object_type']} {item['object_instance']} objectName"))
                                    item['named'] = True
                                except Exception as error:
                                    item['error'] = str(error)
                    self._call(names, max(30, len(visible) * self.settings['timeout'] + 2))
                    return {'items': [{**item, 'children': False, 'selectable': True, 'type': object_label(item['object_type'], item['object_instance'])} for item in visible],
                            'total': len(objects), 'offset': offset, 'timestamp': time.time()}
                else:
                    raise ValueError('Expand a BACnet device to browse its objects')
                if search:
                    items = [item for item in items if search.casefold() in item['name'].casefold()]
                self.health = {'quality': 'good', 'message': f'BACnet/IP ready · {len(self.devices)} discovered device(s)'}
                return {'items': items[offset:offset + 100], 'total': len(items), 'offset': offset, 'timestamp': time.time()}
            except Exception as error:
                self.health = {'quality': 'bad', 'message': str(error)}
                raise ValueError(str(error)) from error

    def properties(self, node):
        match = re.fullmatch(r'(\d+)/(\d+):(\d+)', node)
        if not match:
            raise ValueError('Select an object')
        identity, kind, instance = map(int, match.groups())
        async def read(client):
            device=await self._device(client, identity)
            base=f"{device['address']} {kind} {instance}"
            name=str(await self._read(client, base+' objectName'))
            values, warning = {}, ''
            try:
                try:
                    identifiers=await self._read(client, base+' propertyList')
                except Exception:
                    count=int(await self._read(client, base+' propertyList', arr_index=0))
                    if not 0 <= count <= 10000:
                        raise ValueError('Invalid property list size')
                    identifiers=[await self._read(client, base+' propertyList', arr_index=index) for index in range(1,count+1)]
                values['propertyList']=identifiers
                props={property_name(value) for value in identifiers}
                props.update(('objectIdentifier','objectName','objectType','propertyList'))
            except Exception:
                try:
                    result=await asyncio.wait_for(client.readMultiple('',request_dict={'address':device['address'],'objects':{f'{kind}:{instance}':['all']}}), self.settings['timeout'])
                    if not isinstance(result, dict):
                        raise ValueError('Device did not return a property map')
                    for entries in result.values():
                        for identifier,value in entries:
                            values[property_name(identifier)]=value
                    if not values:
                        raise ValueError('No properties returned')
                    props=set(values)
                except Exception:
                    warning='Device does not advertise its property list; showing readable standard properties.'
                    try:
                        import bacpypes3.object
                        from bacpypes3.vendor import get_vendor_info
                        cls=get_vendor_info(0).get_object_class(kind)
                        props=set(cls._elements) if cls else set(PROPERTIES)
                    except ImportError:
                        props=set(PROPERTIES) | {'objectName','objectIdentifier','objectType','description'}
            props.update(('objectIdentifier','objectName','objectType','propertyList'))
            values.setdefault('objectName',name)
            items=[]
            # Keep the familiar properties first, followed by the remaining property names.
            for prop in sorted(props, key=lambda p: (list(PROPERTIES).index(p) if p in PROPERTIES else 3,p.casefold())):
                try:
                    value=values[prop] if prop in values else await self._read(client, base+' '+prop)
                    items.append({**property_item(node,prop,value),'name':name})
                except Exception as error:
                    if transport_error(error):
                        warning='Some properties could not be read: '+str(error)
                        break  # Avoid one transport timeout per remaining property.
                    # Standard-property fallback probes optional properties; omit unsupported ones.
                    if not warning:
                        items.append({'address':f'{node}/{prop}','property':prop,'label':PROPERTIES.get(prop,prop),'available':False,'selectable':False,'error':str(error)})
            return {'name':name,'items':items,'timestamp':time.time(),'warning':warning}
        with self.lock:
            cached=self.property_cache.get(node)
            if cached and time.monotonic()-cached[0] < 30:
                return copy.deepcopy(cached[1])
            result=self._call(read, max(60,self.settings['timeout']*200+2))
            self.property_cache[node]=(time.monotonic(),result)
            return copy.deepcopy(result)

    def describe(self, address):
        identity, kind, instance, prop=parse_address(address)
        async def read(client):
            device=await self._device(client,identity)
            base=f"{device['address']} {kind} {instance}"
            name=str(await self._read(client,base+' objectName'))
            item=property_item(address.rsplit('/',1)[0],prop,await self._read(client,base+' '+prop))
            if not item['available']:
                raise ValueError(item.get('error','Property unavailable'))
            if not item['selectable']:
                raise ValueError('Complex properties are preview-only; select a scalar property')
            return {'name':name,'type':item['data_type'],'writable':True,'bacnet_path':path_suffix(address),'property':prop}
        with self.lock:
            return self._call(read,max(30,self.settings['timeout']*3+2))

    def read_many(self, addresses):
        with self.lock:
            if time.monotonic() < self.retry_at:
                return {address: {'value': None, 'quality': 'bad', 'error': self.health['message']} for address in addresses}
            async def read(client):
                samples, groups = {}, {}
                for address in addresses:
                    device, kind, instance, prop = parse_address(address)
                    groups.setdefault(device, []).append((address, kind, instance, prop))
                for identity, entries in groups.items():
                    failure = self.device_failures.get(identity)
                    if failure and time.monotonic() < failure[0]:
                        for address, *_ in entries:
                            samples[address] = {'quality': 'bad', 'value': None, 'error': failure[1]}
                        continue
                    try:
                        device = await self._device(client, identity)
                        self.device_failures.pop(identity, None)
                    except Exception as error:
                        self.device_failures[identity] = (time.monotonic() + 3, str(error))
                        for address, *_ in entries:
                            samples[address] = {'quality': 'bad', 'value': None, 'error': str(error)}
                        continue
                    for start in range(0, len(entries), self.settings['batch_size']):
                        if identity in self.device_failures:
                            break
                        batch = entries[start:start + self.settings['batch_size']]
                        request = device['address'] + ' ' + ' '.join(f'{kind} {instance} {prop}' for _, kind, instance, prop in batch)
                        try:
                            if identity in self.single_property_devices:
                                raise ValueError('RPM unsupported')
                            values = await asyncio.wait_for(client.readMultiple(request, timeout=self.settings['timeout']), self.settings['timeout'])
                            if not isinstance(values, list) or len(values) != len(batch):
                                raise ValueError('Incomplete ReadPropertyMultiple response')
                            for (address, _, _, prop), value in zip(batch, values):
                                try:
                                    samples[address] = {'quality': 'good', 'value': scalar(value, prop), 'error': ''}
                                except Exception as error:
                                    samples[address] = {'quality': 'bad', 'value': None, 'error': str(error)}
                        except Exception as error:
                            message = str(error) or 'BACnet request timed out'
                            transport_failure = transport_error(error)
                            if transport_failure:
                                # A device can ignore RPM while still answering ReadProperty.
                                address, kind, instance, prop = batch[0]
                                try:
                                    probe = scalar(await self._read(client, f"{device['address']} {kind} {instance} {prop}"), prop)
                                    samples[address] = {'quality': 'good', 'value': probe, 'error': ''}
                                    self.single_property_devices.add(identity)
                                except Exception:
                                    self.device_failures[identity] = (time.monotonic() + 3, message)
                                    self.devices.pop(identity, None)
                                    for address, *_ in entries:
                                        samples.setdefault(address, {'quality': 'bad', 'value': None, 'error': message})
                                    break  # Never incur one transport timeout per tag.
                            elif any(token in message.lower() for token in ('unsupported', 'segmentation', 'unrecognized-service')):
                                self.single_property_devices.add(identity)
                            # Devices without RPM/segmentation support still work.
                            for address, kind, instance, prop in batch:
                                if address in samples:
                                    continue
                                try:
                                    value = scalar(await self._read(client, f"{device['address']} {kind} {instance} {prop}"), prop)
                                    samples[address] = {'quality': 'good', 'value': value, 'error': ''}
                                except Exception as error:
                                    message = str(error) or 'BACnet request timed out'
                                    samples[address] = {'quality': 'bad', 'value': None, 'error': message}
                                    if transport_error(error):
                                        self.device_failures[identity] = (time.monotonic() + 3, message)
                                        self.devices.pop(identity, None)
                                        for target, *_ in entries:
                                            samples.setdefault(target, {'quality': 'bad', 'value': None, 'error': message})
                                        break
                return samples
            try:
                samples = self._call(read, max(30, (len(addresses) * 2 + 2) * self.settings['timeout']))
            except Exception as error:
                samples = {address: {'value': None, 'quality': 'bad', 'error': str(error)} for address in addresses}
            errors = [sample['error'] for sample in samples.values() if sample['quality'] != 'good']
            self.health = {'quality': 'bad' if errors else 'good', 'message': errors[0] if errors else 'BACnet/IP connected'}
            if errors and len(errors) == len(samples):
                self.retry_at = time.monotonic() + 3
                # Re-resolve device instances on retry rather than retaining a stale IP.
                self.devices = {}
            return samples

    def read(self, address):
        sample = self.read_many([address])[address]
        if sample['quality'] != 'good':
            raise ValueError(sample['error'])
        return sample['value']

    def write(self, address, value):
        identity, kind, instance, prop = parse_address(address)
        if not math.isfinite(float(value)):
            raise ValueError('Write value must be finite')
        if prop == 'presentValue' and kind in (3, 4, 5):
            if value not in (0, 1):
                raise ValueError('Binary Present Value must be 0 or 1')
            encoded = 'active' if value else 'inactive'
        else:
            encoded = str(value)
        async def write(client):
            device = await self._device(client, identity)
            priority=f" - {self.settings['write_priority']}" if prop=='presentValue' else ''
            response = await asyncio.wait_for(client._write(f"{device['address']} {kind} {instance} {prop} {encoded}{priority}"), self.settings['timeout'])
            if isinstance(response, str):
                raise ValueError('BACnet write was rejected: ' + response)
        with self.lock:
            try:
                self._call(write)
            except Exception as error:
                raise ValueError(f'BACnet write to {prop} failed: {error}') from error

    def test(self):
        with self.lock:
            devices = self.discover(True)
            if not devices:
                raise ValueError('BACnet/IP started, but no devices answered discovery. Check the interface, subnet, target and UDP port.')
            self.health = {'quality': 'good', 'message': f'Found {len(devices)} BACnet device(s)'}
            return {**self.health, 'device_count': len(devices)}

    def status(self):
        return dict(self.health)

    def close(self):
        with self.lock, _pool_lock:
            if self.closed:
                return
            self.closed = True
            self.session.users -= 1
            if self.session.users == 0:
                try:
                    _runtime.call(self.session.close(), 10)
                finally:
                    _sessions.pop(self.session_key, None)
