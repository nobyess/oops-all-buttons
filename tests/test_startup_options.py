import contextlib
import io
import sys
import unittest
from unittest.mock import patch
from run import parse_options

class StartupOptionsTests(unittest.TestCase):
    def test_server_only_defaults_in_source_and_portable(self):
        for frozen in (False, True):
            with patch.object(sys, 'frozen', frozen, create=True):
                args = parse_options([])
                self.assertFalse(args.browser)
                self.assertFalse(args.kiosk)
                self.assertFalse(args.tray)

    def test_explicit_launch_options(self):
        args = parse_options(['--tray', '--kiosk'])
        self.assertTrue(args.tray)
        self.assertTrue(args.kiosk)
        self.assertFalse(args.browser)
        args = parse_options(['--browser'])
        self.assertTrue(args.browser)
        self.assertFalse(args.tray)

    def test_old_flags_removed_and_launch_modes_exclusive(self):
        for options in (['--no-browser'], ['--no-tray'], ['--browser','--kiosk']):
            with self.subTest(options=options), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                parse_options(options)
