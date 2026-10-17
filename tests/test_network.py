import ctypes as c
import socket
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from hmi.network import local_interfaces, _linux_interfaces


class NetworkTests(unittest.TestCase):
    def test_platform_dispatch(self):
        for platform, helper in [('linux', '_linux_interfaces'), ('linux2', '_linux_interfaces'), ('win32', '_windows_interfaces')]:
            with patch('hmi.network.sys.platform', platform), patch('hmi.network.' + helper, return_value=[{'name': 'Adapter', 'address': '192.168.1.2'}]) as call:
                self.assertEqual(local_interfaces()[0]['name'], 'Adapter')
                call.assert_called_once()

    def test_linux_enumeration_multiple_addresses_filters_and_cleanup(self):
        keep = []
        def enumerate(head):
            entry_type = head._obj._type_
            rows = []
            for name, address, flags, family in [
                (b'eth0', '192.168.1.2', 1, socket.AF_INET),
                (b'eth0', '192.168.1.3', 1, socket.AF_INET),
                (b'eth0', '192.168.1.2', 1, socket.AF_INET),
                (b'wlan0', '10.0.0.4', 1, socket.AF_INET),
                (b'lo', '127.0.0.1', 9, socket.AF_INET),
                (b'down', '10.0.0.8', 0, socket.AF_INET),
                (b'empty', '0.0.0.0', 1, socket.AF_INET),
                (b'ipv6', '10.0.0.9', 1, 10),
            ]:
                raw = c.create_string_buffer(int(family).to_bytes(2, sys.byteorder) + b'\0\0' + socket.inet_aton(address) + b'\0'*8)
                row = entry_type();row.name = name;row.flags = flags;row.address = c.addressof(raw)
                keep.extend([raw, row]);rows.append(row)
            null = entry_type();null.name = b'null';null.flags = 1;rows.append(null);keep.append(null)
            for row, following in zip(rows, rows[1:]): row.next = c.pointer(following)
            c.cast(head, c.POINTER(c.POINTER(entry_type)))[0] = c.pointer(rows[0])
            return 0
        libc = SimpleNamespace(getifaddrs=Mock(side_effect=enumerate), freeifaddrs=Mock())
        with patch('ctypes.CDLL', return_value=libc):
            self.assertEqual(_linux_interfaces(), [
                {'name': 'eth0', 'address': '192.168.1.2'},
                {'name': 'eth0', 'address': '192.168.1.3'},
                {'name': 'wlan0', 'address': '10.0.0.4'}])
        libc.freeifaddrs.assert_called_once()

    def test_linux_empty_interfaces(self):
        libc = SimpleNamespace(getifaddrs=Mock(return_value=0), freeifaddrs=Mock())
        with patch('ctypes.CDLL', return_value=libc): self.assertEqual(_linux_interfaces(), [])
        libc.freeifaddrs.assert_called_once()

    def test_linux_errors_reported(self):
        libc = SimpleNamespace(getifaddrs=Mock(return_value=-1), freeifaddrs=Mock())
        with patch('ctypes.CDLL', return_value=libc), patch('ctypes.get_errno', return_value=13):
            with self.assertRaises(OSError) as error: _linux_interfaces()
        self.assertEqual(error.exception.errno, 13)
        libc.freeifaddrs.assert_not_called()

    @unittest.skipUnless(sys.platform.startswith('linux'), 'Requires actual Linux networking')
    def test_real_linux_discovery(self):
        names = {name for _, name in socket.if_nameindex()}
        for entry in local_interfaces():
            self.assertIn(entry['name'], names)
            self.assertNotEqual(entry['address'], '127.0.0.1')
            socket.inet_aton(entry['address'])
