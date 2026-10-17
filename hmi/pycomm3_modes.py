"""SLC data files and generic CIP scalar attributes. No guessed device writes."""
import re
import time
from .pycomm3_logix import PyComm3LogixDriver, connection_settings, bind_plc_socket

NUMERIC_TYPES = ('BOOL', 'SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT', 'REAL', 'LREAL')


def explicit_path(path):
    parts = path.replace('\\', '/').split('/')
    return parts[0] + '/backplane/' + parts[1] if len(parts) == 2 and parts[1].isdigit() else path


def identity(plc):
    from pycomm3.custom_types import ModuleIdentityObject
    routed = bool(plc._cfg.get('cip_path'))
    reply = plc.generic_message(service=0x01, class_code=0x01, instance=1,
        data_type=ModuleIdentityObject, connected=False, unconnected_send=routed, route_path=routed, name='Device identity')
    if reply.error:
        raise ValueError('Identity query failed: ' + str(reply.error))
    return reply.value


def classify_device(info):
    name = str(info.get('product_name', '')).upper()
    if any(token in name for token in ('MICROLOGIX', 'SLC', '1747-', '1761-', '1762-', '1763-', '1764-', '1766-')):
        return 'slc'
    if any(token in name for token in ('CONTROLLOGIX', 'COMPACTLOGIX', 'MICRO800', '1756-L', '1769-L', '5069-L', '2080-')):
        return 'logix'
    return 'cip'


def auto_select(settings):
    from pycomm3 import CIPDriver
    normalized = connection_settings({**settings, 'protocol': 'cip'})
    plc = CIPDriver(explicit_path(normalized['path']))
    timeout = max(5, normalized['timeout'])
    plc.socket_timeout = timeout
    try:
        if normalized.get('local_ip'):
            bind_plc_socket(plc, normalized['local_ip'], timeout)
        if not plc.open():
            raise ValueError('Device refused session registration')
        info = identity(plc)
        return {'protocol': classify_device(info), 'message': info.get('product_name', 'CIP device'), 'identity': {key: value.hex() if isinstance(value, bytes) else value for key, value in info.items()}}
    except Exception as error:
        messages = []
        current = error
        for _ in range(4):
            if current is None:break
            message = str(current)
            if message and message not in messages:messages.append(message)
            current = current.__cause__ or current.__context__
        raise ValueError('Auto Select failed: ' + ' — '.join(messages)) from error
    finally:
        try:plc.close()
        except Exception:pass


class PyComm3CIPDriver(PyComm3LogixDriver):
    def __init__(self, settings, factory=None):
        if factory is None:
            try:
                from pycomm3 import CIPDriver
            except ImportError as error:
                raise ValueError('Install pycomm3: python -m pip install -r requirements-plc.txt') from error
            factory = CIPDriver
        super().__init__(settings, factory)

    def _connect(self):
        if self.plc is not None and self.plc.connected:
            return self.plc
        if time.monotonic() < self.retry_at:
            raise ValueError(self.health['message'])
        try:
            self.plc = self.factory(explicit_path(self.settings['path']))
            self.plc.socket_timeout = self.settings['timeout']
            if self.settings.get('local_ip'):
                bind_plc_socket(self.plc, self.settings['local_ip'], self.settings['timeout'])
            if not self.plc.open():
                raise ValueError('Device refused connection')
            self.health = {'quality': 'good', 'message': 'Connected'}
            return self.plc
        except Exception as error:
            self._failed(error)
            raise ValueError(str(error)) from error

    def test(self):
        with self.lock:
            self.retry_at = 0
            try:
                info = identity(self._connect())
                return {'quality': 'good', 'message': info.get('product_name', 'CIP device'), 'tag_count': 0}
            except Exception as error:
                self._failed(error)
                raise ValueError(str(error)) from error

    @staticmethod
    def specification(address):
        match = re.fullmatch(r'(0x[0-9a-fA-F]+|[0-9]+)/(0x[0-9a-fA-F]+|[0-9]+)/(0x[0-9a-fA-F]+|[0-9]+):([A-Z]+)', address)
        if not match or match[4] not in NUMERIC_TYPES:
            raise ValueError('CIP address must be Class/Instance/Attribute:TYPE, e.g. 4/100/3:REAL')
        numbers = [int(value, 16 if value.lower().startswith('0x') else 10) for value in match.groups()[:3]]
        if any(value > 65535 for value in numbers):
            raise ValueError('CIP identifiers must be between 0 and 65535')
        return (*numbers, match[4])

    def describe(self, address):
        return {'type': self.specification(address)[3], 'writable': True}

    def _attribute(self, address, value=None, write=False):
        from pycomm3 import DataTypes
        class_code, instance, attribute, dtype = self.specification(address)
        plc = self._connect()
        if write:
            if dtype == 'BOOL':
                if value not in (0, 1):raise ValueError('BOOL tags require 0 or 1')
                value = bool(value)
            elif dtype not in ('REAL', 'LREAL'):
                if not float(value).is_integer():raise ValueError('Integer attributes require whole numbers')
                value = int(value)
        routed = bool(plc._cfg.get('cip_path'))
        return plc.generic_message(service=0x10 if write else 0x0E, class_code=class_code, instance=instance,
            attribute=attribute, request_data=DataTypes.get(dtype).encode(value) if write else b'',
            data_type=None if write else DataTypes.get(dtype), connected=False,
            unconnected_send=routed, route_path=routed, name=address)

    def read_many(self, addresses):
        with self.lock:
            result = {}
            try:
                for address in addresses:
                    reply = self._attribute(address)
                    result[address] = {'value': reply.value if not reply.error else None,
                        'quality': 'bad' if reply.error else 'good', 'error': reply.error or ''}
                self.health = {'quality': 'good', 'message': 'Connected'}
                return result
            except Exception as error:
                self._failed(error)
                raise ValueError(str(error)) from error

    def write(self, address, value):
        with self.lock:
            reply = self._attribute(address, value, True)
            if reply.error:raise ValueError(str(reply.error))


class PyComm3SLCDriver(PyComm3CIPDriver):
    def __init__(self, settings, factory=None):
        if factory is None:
            try:
                from pycomm3 import SLCDriver
            except ImportError as error:
                raise ValueError('Install pycomm3: python -m pip install -r requirements-plc.txt') from error
            factory = SLCDriver
        super().__init__(settings, factory)

    def describe(self, address):
        from pycomm3.slc_driver import parse_tag
        parsed = parse_tag(address)
        if not parsed or parsed.get('tag', '').upper() != address.upper() or parsed.get('element_count', 1) != 1 or '{' in address:
            raise ValueError('Enter a single SLC data-file address, e.g. N7:0, F8:0 or B3:0/0')
        file_type = parsed['file_type']
        dtype = 'BOOL' if '/' in address or re.search(r'\.(DN|EN|TT|CU|CD|OV|UN|UA)$', address, re.I) else {'F': 'REAL', 'L': 'DINT', 'ST': 'STRING'}.get(file_type, 'INT')
        # Whole timer/counter/control structures require selecting a member.
        if file_type in ('T', 'C', 'R') and '.' not in address and '/' not in address:
            raise ValueError('Select a member, for example T4:0.ACC or T4:0.DN')
        return {'type': dtype, 'writable': True}

    def read_many(self, addresses):
        return PyComm3LogixDriver.read_many(self, addresses)

    def write(self, address, value):
        return PyComm3LogixDriver.write(self, address, value)


def create_driver(settings):
    protocol = connection_settings(settings)['protocol']
    return {'logix': PyComm3LogixDriver, 'slc': PyComm3SLCDriver, 'cip': PyComm3CIPDriver}[protocol](settings)
