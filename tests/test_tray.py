import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from hmi.tray import run_tray


class TrayTests(unittest.TestCase):
    def test_exit_callback_and_launch(self):
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
                entries[1]['action'](self, None)
                entries[-1]['action'](self, None)

            def stop(self):
                calls.append('tray stopped')

        module = SimpleNamespace(Menu=Menu, Icon=Icon, MenuItem=lambda label, action, **kwargs: dict(label=label, action=action, **kwargs))
        with patch.dict(sys.modules, {'pystray': module}), patch('hmi.tray.application_version',return_value='0.1.9'):
            run_tray('http://127.0.0.1:8080', on_exit=lambda: calls.append('server stopped'), launch=lambda: calls.append('launched'))
        self.assertEqual(calls, ['launched', 'tray stopped', 'server stopped'])
        self.assertEqual(entries[-1]['label'], 'Exit')
        self.assertFalse(entries[0]['enabled'])
        self.assertTrue(entries[1]['default'])
        self.assertEqual([entry['label'] for entry in entries], ['Oops! All Buttons 0.1.9', 'Launch', 'Exit'])

    def test_restart_callback_and_menu(self):
        entries=[]
        calls=[]
        class Menu:
            SEPARATOR=object()
            def __init__(self,*items):entries.extend(item for item in items if isinstance(item,dict))
        class Icon:
            def __init__(self,*args):pass
            def run(self):entries[2]['action'](self,None)
            def stop(self):calls.append('tray stopped')
        module=SimpleNamespace(Menu=Menu,Icon=Icon,MenuItem=lambda label,action,**kwargs:dict(label=label,action=action,**kwargs))
        with patch.dict(sys.modules,{'pystray':module}), patch('hmi.tray.application_version',return_value='0.1.9'):
            run_tray('http://127.0.0.1:8080',on_exit=lambda:calls.append('exit'),on_restart=lambda:calls.append('restart'))
        self.assertEqual([entry['label'] for entry in entries],['Oops! All Buttons 0.1.9','Launch','Restart Server','Exit'])
        self.assertEqual(calls,['tray stopped','restart'])
