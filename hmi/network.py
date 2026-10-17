"""Read local IPv4 interfaces without changing network configuration."""
import ipaddress
import socket
import sys


def local_interfaces():
    if sys.platform == 'win32':
        return _windows_interfaces()
    if sys.platform.startswith('linux'):
        return _linux_interfaces()
    addresses = {entry[4][0] for entry in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)}
    return [{'address': value, 'name': value} for value in sorted(addresses) if not ipaddress.ip_address(value).is_loopback]


def _linux_interfaces():
    # Linux getifaddrs enumerates assigned addresses directly, including aliases.
    # Hostname lookup often resolves only to 127.0.1.1 on Debian/Raspberry Pi OS.
    import ctypes as c
    import os

    class IfAddrs(c.Structure):
        pass
    IfAddrs._fields_ = [('next', c.POINTER(IfAddrs)), ('name', c.c_char_p),
        ('flags', c.c_uint), ('address', c.c_void_p), ('netmask', c.c_void_p),
        ('broadcast_or_destination', c.c_void_p), ('data', c.c_void_p)]
    libc = c.CDLL(None, use_errno=True)
    get = libc.getifaddrs
    get.argtypes = [c.POINTER(c.POINTER(IfAddrs))]
    get.restype = c.c_int
    free = libc.freeifaddrs
    free.argtypes = [c.POINTER(IfAddrs)]
    free.restype = None
    head = c.POINTER(IfAddrs)()
    if get(c.byref(head)) != 0:
        error = c.get_errno()
        raise OSError(error, os.strerror(error))
    found = set()
    try:
        current = head
        while current:
            entry = current.contents
            # IFF_UP, excluding IFF_LOOPBACK; IPv6 and link-layer entries are skipped.
            if entry.address and entry.flags & 1 and not entry.flags & 8:
                raw = c.string_at(entry.address, 8)
                if int.from_bytes(raw[:2], sys.byteorder) == socket.AF_INET:
                    address = socket.inet_ntoa(raw[4:8])
                    ip = ipaddress.IPv4Address(address)
                    if not (ip.is_loopback or ip.is_unspecified or ip.is_multicast):
                        found.add((os.fsdecode(entry.name) if entry.name else address, address))
            current = entry.next
    finally:
        free(head)
    return [{'name': name, 'address': address} for name, address in sorted(found)]


def _windows_interfaces():
    import ctypes as c
    from ctypes import wintypes as w
    class SocketAddress(c.Structure):
        _fields_ = [('address', c.c_void_p), ('length', c.c_int)]
    class Unicast(c.Structure):
        pass
    Unicast._fields_ = [('alignment', c.c_ulonglong), ('next', c.POINTER(Unicast)), ('socket', SocketAddress)]
    class Adapter(c.Structure):
        pass
    Adapter._fields_ = [('alignment', c.c_ulonglong), ('next', c.POINTER(Adapter)),
        ('adapter_name', c.c_char_p), ('unicast', c.POINTER(Unicast)),
        ('anycast', c.c_void_p), ('multicast', c.c_void_p), ('dns_server', c.c_void_p),
        ('dns_suffix', c.c_wchar_p), ('description', c.c_wchar_p), ('friendly_name', c.c_wchar_p),
        ('physical_address', c.c_ubyte * 8), ('physical_length', w.ULONG), ('flags', w.ULONG),
        ('mtu', w.ULONG), ('interface_type', w.ULONG), ('oper_status', c.c_int)]
    get = c.WinDLL('iphlpapi').GetAdaptersAddresses
    get.argtypes = [w.ULONG, w.ULONG, c.c_void_p, c.POINTER(Adapter), c.POINTER(w.ULONG)]
    get.restype = w.ULONG
    size = w.ULONG(15000)
    for _ in range(3):
        buffer = c.create_string_buffer(size.value)
        head = c.cast(buffer, c.POINTER(Adapter))
        code = get(socket.AF_INET, 0, None, head, c.byref(size))
        if code == 111:
            continue
        if code == 232:
            return []
        if code:
            raise OSError(code, 'Unable to list network interfaces')
        result = []
        current = head
        while current:
            adapter = current.contents
            address = adapter.unicast
            while address and adapter.oper_status == 1:
                entry = address.contents
                if entry.socket.address and entry.socket.length >= 8:
                    raw = c.string_at(entry.socket.address, 8)
                    if int.from_bytes(raw[:2], sys.byteorder) == socket.AF_INET:
                        ip = socket.inet_ntoa(raw[4:8])
                        if not ipaddress.ip_address(ip).is_loopback:
                            result.append({'name': adapter.friendly_name or ip, 'address': ip})
                address = entry.next
            current = adapter.next
        return sorted(result, key=lambda entry: (entry['name'], entry['address']))
    raise OSError('Network interfaces changed while listing; try again')
