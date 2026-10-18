"""pycomm3 adapter. One serialized connection per source, lazy connection/discovery."""
import ipaddress
import math
import threading
import time


def connection_settings(settings):
    result = dict(settings)
    result['protocol'] = result.get('protocol', 'logix')
    if result['protocol'] not in ('logix', 'slc', 'cip'):
        raise ValueError('Choose CIP, Logix, or SLC')
    if 'protocol' not in settings and result.get('plc_type') not in ('controllogix', 'compactlogix'):
        raise ValueError('Choose ControlLogix or CompactLogix (SLC is not supported)')
    result['path'] = str(result.get('path', '')).strip()
    if not result['path']:
        raise ValueError('PLC network path is required')
    local_ip = str(result.get('local_ip', '')).strip()
    if local_ip:
        try:
            address = ipaddress.IPv4Address(local_ip)
            if address.is_unspecified or address.is_multicast:
                raise ValueError('Choose a local unicast IPv4 address')
        except ipaddress.AddressValueError as error:
            raise ValueError('Local interface must be an IPv4 address') from error
        result['local_ip'] = str(address)
    else:
        result.pop('local_ip', None)
    for key, default in [('timeout', 3), ('background', 20), ('live', 0.5)]:
        try:
            value = float(result.get(key, default))
        except (ValueError, TypeError) as error:
            raise ValueError(f'{key} must be a positive number') from error
        maximum = 3600 if key == 'timeout' else 60
        if not math.isfinite(value) or not 0.1 <= value <= maximum:
            raise ValueError(f'{key} must be between 0.1 and {maximum} seconds')
        result[key] = value
    if result['live'] > result['background']:
        raise ValueError('Live polling must be at least as fast as Background')
    return result


def bind_plc_socket(plc, local_ip, timeout, socket_factory=None):
    """Isolate pycomm3 1.2.16's private socket hook; never change OS routes."""
    if socket_factory is None:
        from pycomm3.socket_ import Socket
        socket_factory = Socket
    transport = socket_factory(timeout)
    # Attach before bind so normal driver cleanup also handles bind failures.
    plc._sock = transport
    transport.sock.bind((local_ip, 0))


class PyComm3LogixDriver:
    def __init__(self, settings, factory=None):
        self.settings = connection_settings(settings)
        if factory is None:
            try:
                from pycomm3 import LogixDriver
            except ImportError as error:
                raise ValueError('Install pycomm3: python -m pip install -r requirements-plc.txt') from error
            factory = LogixDriver
        self.factory = factory
        self.lock = threading.RLock()
        self.plc = None
        self.nodes = {}
        self.discovered_at = None
        self.retry_at = 0
        self.health = {'quality': 'idle', 'message': 'Waiting for tag discovery or polling'}

    def _connect(self):
        if self.plc is not None and self.plc.connected:
            return self.plc
        if time.monotonic() < self.retry_at:
            raise ValueError(self.health['message'])
        try:
            plc = self.factory(self.settings['path'], init_tags=False, init_program_tags=True)
            plc.socket_timeout = self.settings['timeout']
            self.plc = plc
            if self.settings.get('local_ip'):
                bind_plc_socket(plc, self.settings['local_ip'], self.settings['timeout'])
            if not plc.open():
                raise ValueError('PLC refused connection')
            product = plc.info.get('product_name', '').lower()
            if 'micrologix' in product or 'slc' in product:
                raise ValueError('This release supports ControlLogix and CompactLogix only')
            plc.get_tag_list(program='*')
            self._index()
            self.health = {'quality': 'good', 'message': 'Connected'}
            return plc
        except Exception as error:
            self._failed(error)
            raise ValueError(self.health['message']) from error

    def _index(self):
        self.nodes = {}
        for name, spec in self.plc.tags.items():
            dims = tuple(int(d) for d in spec.get('dimensions', []) if d)
            self.nodes[name] = (spec, dims, spec.get('external_access') == 'Read/Write')
        self.roots = sorted(self.nodes)
        self.discovered_at = time.time()

    def _failed(self, error):
        suffix = ' (local interface ' + self.settings['local_ip'] + ')' if self.settings.get('local_ip') else ''
        messages, seen = [], set()
        current = error
        for _ in range(8):
            if current is None or id(current) in seen:break
            seen.add(id(current))
            for part in (str(current) or type(current).__name__).split(' — '):
                if suffix:
                    while part.endswith(suffix):part=part[:-len(suffix)]
                if part and part not in messages:messages.append(part)
            current = current.__cause__ or current.__context__
        message = ' — '.join(messages) + suffix
        # A cached cooldown error is not a new failed connection attempt.
        if (self.plc is None and self.health.get('quality') == 'bad'
                and self.health.get('message') == message and time.monotonic() < self.retry_at):
            return
        self.health = {'quality': 'bad', 'message': message}
        self.retry_at = time.monotonic() + 3
        if self.plc is not None:
            try:
                self.plc.close()
            except Exception:
                pass
        self.plc = None

    def test(self):
        with self.lock:
            try:
                self.retry_at = 0
                plc = self._connect()
                product = plc.info.get('product_name', '')
                if 'micrologix' in product.lower() or 'slc' in product.lower():
                    raise ValueError('This release supports ControlLogix and CompactLogix only')
                return {'quality': 'good', 'message': product or 'PLC connected', 'tag_count': len(self.roots)}
            except Exception as error:
                self._failed(error)
                raise ValueError(self.health['message']) from error

    @staticmethod
    def _members(spec):
        dtype = spec.get('data_type')
        if not isinstance(dtype, dict) or dtype.get('string'):
            return {}
        internal = dtype.get('internal_tags', {})
        return {name: internal[name] for name in dtype.get('attributes', internal) if name in internal}

    def browse(self, node='', offset=0, search='', refresh=False, tree=False):
        with self.lock:
            try:
                self._connect()
                if refresh:
                    self.plc.get_tag_list(program='*')
                    self._index()
                array_info = None
                programs = {name.split('.', 1)[0] for name in self.roots if name.startswith('Program:') and '.' in name}
                if not node:
                    names = sorted([name for name in self.roots if not (tree and name.startswith('Program:'))] + (list(programs) if tree else []), key=lambda name: (0 if tree and name in programs else 1, name.casefold()))
                elif tree and node in programs:
                    names = [name for name in self.roots if name.startswith(node + '.')]
                else:
                    if node not in self.nodes:
                        raise ValueError('Browse from the root after refreshing discovery')
                    spec, dims, writable = self.nodes[node]
                    if dims:
                        # Multidimensional Logix addresses use one [i,j,k] suffix.
                        partial = node.endswith(']') and spec.get('_partial_index')
                        names = (node[:-1] + ',' + str(index) + ']' if partial else f'{node}[{index}]' for index in range(dims[0]))
                        array_info = ({**spec, '_partial_index': len(dims) > 1}, dims[1:], writable)
                    else:
                        names = []
                        for member, definition in self._members(spec).items():
                            child = node + '.' + member
                            size = definition.get('array', 0)
                            self.nodes[child] = (definition, (int(size),) if size else (), writable and definition.get('external_access', 'Read/Write') == 'Read/Write')
                            names.append(child)
                filtered, total = [], 0
                for name in names:
                    matches = search.lower() in name.lower() or (tree and name in programs and any(search.lower() in tag.lower() for tag in self.roots if tag.startswith(name + '.')))
                    if matches:
                        if offset <= total < offset + 200:
                            filtered.append(name)
                            if array_info:
                                self.nodes[name] = array_info
                        total += 1
                result = []
                for name in filtered:
                    if tree and name in programs:
                        result.append({'address': name, 'type': 'Program', 'children': True, 'selectable': False, 'writable': False, 'program': True})
                        continue
                    spec, dims, writable = self.nodes[name]
                    children = bool(dims or self._members(spec))
                    access = spec.get('external_access')
                    result.append({'address': name, 'type': spec.get('data_type_name', 'Unknown'),
                                   'children': children, 'selectable': not children and access != 'None',
                                   'writable': writable and not children, 'dimensions': dims})
                return {'items': result, 'total': total, 'offset': offset, 'timestamp': self.discovered_at}
            except Exception as error:
                # A stale browse node is not a connection failure.
                if isinstance(error, ValueError) and str(error).startswith('Browse from'):
                    raise
                self._failed(error)
                raise ValueError(self.health['message']) from error

    def describe(self, address):
        # Resolve a leaf without materializing all members/array elements.
        import re
        with self.lock:
            self._connect()
            roots = [name for name in self.roots if address == name or address.startswith(name + '.') or address.startswith(name + '[')]
            if not roots:
                raise ValueError('Tag is not in cached PLC discovery; refresh the browser')
            root = max(roots, key=len)
            spec, dims, writable = self.nodes[root]
            suffix = address[len(root):]
            while suffix:
                if suffix.startswith('['):
                    match = re.match(r'\[([0-9,]+)\]', suffix)
                    if not match:
                        raise ValueError('Invalid array address')
                    indices = [int(i) for i in match[1].split(',')]
                    if len(indices) != len(dims) or any(i >= d for i, d in zip(indices, dims)):
                        raise ValueError('Array index is outside its bounds')
                    dims = ()
                    suffix = suffix[len(match[0]):]
                elif suffix.startswith('.') and not dims:
                    match = re.match(r'\.([^.[\]]+)', suffix)
                    members = self._members(spec)
                    if not match or match[1] not in members:
                        raise ValueError('Unknown structure member')
                    spec = members[match[1]]
                    writable = writable and spec.get('external_access', 'Read/Write') == 'Read/Write'
                    dims = (int(spec['array']),) if spec.get('array') else ()
                    suffix = suffix[len(match[0]):]
                else:
                    raise ValueError('Select an individual array element')
            if dims or self._members(spec) or spec.get('external_access') == 'None':
                raise ValueError('Select a readable scalar, string, or structure member')
            return {'writable': writable, 'type': spec.get('data_type_name', 'Unknown')}

    def read_many(self, addresses):
        with self.lock:
            try:
                plc = self._connect()
                result = {}
                for start in range(0, len(addresses), 100):
                    batch = addresses[start:start + 100]
                    replies = plc.read(*batch)
                    if len(batch) == 1:
                        replies = [replies]
                    for address, reply in zip(batch, replies):
                        result[address] = {'value': reply.value if not reply.error else None,
                                           'quality': 'bad' if reply.error else 'good', 'error': reply.error or ''}
                self.health = {'quality': 'good', 'message': 'Connected'}
                return result
            except Exception as error:
                self._failed(error)
                raise ValueError(self.health['message']) from error

    def read(self, address):
        sample = self.read_many([address])[address]
        if sample['quality'] != 'good':
            raise ValueError(sample['error'])
        return sample['value']

    def write(self, address, value):
        with self.lock:
            # Validation errors belong to the write, not the transport connection.
            dtype = self.describe(address)['type']
            if dtype == 'BOOL':
                if value not in (0, 1):
                    raise ValueError('BOOL tags require 0 or 1')
                value = bool(value)
            elif dtype in ('SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT', 'DWORD'):
                if not float(value).is_integer():
                    raise ValueError('Integer PLC tags require whole numbers')
                value = int(value)
                bits = {'SINT': 8, 'INT': 16, 'DINT': 32, 'LINT': 64,
                        'USINT': 8, 'UINT': 16, 'UDINT': 32, 'ULINT': 64, 'DWORD': 32}[dtype]
                unsigned = dtype.startswith('U') or dtype == 'DWORD'
                low, high = (0, (1 << bits)-1) if unsigned else (-(1 << (bits-1)), (1 << (bits-1))-1)
                if not low <= value <= high:
                    raise ValueError(f'{dtype} tags require a value between {low} and {high}')
            try:
                result = self._connect().write((address, value))
            except Exception as error:
                self._failed(error)
                raise ValueError(self.health['message']) from error
            # A returned tag error (access denied, encoding, etc.) is not a lost socket.
            if result.error:
                if self.plc is not None and not self.plc.connected:
                    self._failed(result.error)
                raise ValueError(str(result.error))

    def close(self):
        with self.lock:
            if self.plc:
                self.plc.close()
            self.plc = None

    def status(self):
        return dict(self.health)
