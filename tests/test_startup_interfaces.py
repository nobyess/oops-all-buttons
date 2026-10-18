import io
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch
from run import print_network_interfaces


class StartupInterfaceTests(unittest.TestCase):
    def output(self, **kwargs):
        stream = io.StringIO()
        with patch('run.local_interfaces', **kwargs), redirect_stdout(stream):
            print_network_interfaces()
        return stream.getvalue()

    def test_names_and_addresses(self):
        output = self.output(return_value=[{'name':'Wi-Fi','address':'192.168.1.120'}, {'name':'eth0','address':'10.0.0.2'}])
        self.assertIn('Wi-Fi: 192.168.1.120', output)
        self.assertIn('eth0: 10.0.0.2', output)

    def test_missing_or_failed_enumeration_does_not_block_startup(self):
        self.assertIn('No active network interfaces', self.output(return_value=[]))
        self.assertIn('Unable to list interfaces: unavailable', self.output(side_effect=OSError('unavailable')))
