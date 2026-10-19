import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from hmi.tray import run_tray


class TrayTests(unittest.TestCase):
    def test_stop_server_callback_and_updated_links(self):
        entries = []
        calls = []

        class Menu:
            SEPARATOR = object()

            def __init__(self, *items):
                entries.extend(item for item in items if isinstance(item, dict))

        class Icon:
            def __init__(self, *args):
                pass

            def run(self):
                entries[0]['action'](self, None)
                entries[-1]['action'](self, None)

            def stop(self):
                calls.append('tray stopped')

        module = SimpleNamespace(Menu=Menu, Icon=Icon, MenuItem=lambda label, action, **kwargs: dict(label=label, action=action, **kwargs))
        with patch.dict(sys.modules, {'pystray': module}):
            run_tray('http://127.0.0.1:8080', on_exit=lambda: calls.append('server stopped'), launch=lambda: calls.append('launched'))
        self.assertEqual(calls, ['launched', 'server stopped', 'tray stopped'])
        self.assertEqual(entries[-1]['label'], 'Stop Server')
        self.assertTrue(entries[0]['default'])
        self.assertEqual([entry['label'] for entry in entries], ['Launch', 'Stop Server'])
