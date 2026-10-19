import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
from hmi.browser_launch import launch_browser, kiosk_browser

class BrowserLaunchTests(unittest.TestCase):
    def test_normal_browser(self):
        with patch('hmi.browser_launch.webbrowser.open', return_value=True) as opened, patch('hmi.browser_launch.subprocess.Popen') as process:
            self.assertTrue(launch_browser('http://127.0.0.1:8080'))
            opened.assert_called_once_with('http://127.0.0.1:8080')
            process.assert_not_called()

    def test_kiosk_commands_use_separate_profile_and_argument_list(self):
        with tempfile.TemporaryDirectory() as folder:
            for executable, edge in [('C:/Program Files/Microsoft/Edge/Application/msedge.exe', True),('/usr/bin/chromium', False)]:
                profile = Path(folder) / 'Kiosk Profile'
                with patch('hmi.browser_launch.kiosk_browser', return_value=executable), patch('hmi.browser_launch.kiosk_profile', return_value=profile), patch('hmi.browser_launch.subprocess.Popen') as process, patch('hmi.browser_launch.webbrowser.open') as regular:
                    launch_browser('http://127.0.0.1:8080', kiosk=True)
                    command = process.call_args.args[0]
                    self.assertEqual(command[0], executable)
                    self.assertIn('--kiosk', command)
                    self.assertIn('--user-data-dir=' + str(profile), command)
                    self.assertEqual('--edge-kiosk-type=fullscreen' in command, edge)
                    self.assertEqual(command[-1], 'http://127.0.0.1:8080')
                    self.assertTrue(profile.is_dir())
                    regular.assert_not_called()
                    self.assertNotIn('shell', process.call_args.kwargs)

    def test_missing_browser_is_explicit(self):
        with patch('hmi.browser_launch.kiosk_browser', return_value=None), patch('hmi.browser_launch.webbrowser.open') as regular:
            with self.assertRaisesRegex(RuntimeError, 'requires Microsoft Edge'):
                launch_browser('http://127.0.0.1:8080', kiosk=True)
            regular.assert_not_called()

    def test_path_discovery(self):
        with patch('hmi.browser_launch.sys.platform','linux'), patch('hmi.browser_launch.shutil.which', side_effect=lambda name:'/usr/bin/chromium' if name=='chromium' else None), patch('hmi.browser_launch.Path.is_file', return_value=True):
            self.assertEqual(kiosk_browser(), str(Path('/usr/bin/chromium')))
