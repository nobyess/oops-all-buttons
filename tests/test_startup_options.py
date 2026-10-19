import contextlib
import io
import sys
import unittest
from unittest.mock import patch
from run import parse_options

class StartupOptionsTests(unittest.TestCase):
    def test_browser_and_tray_defaults_in_source_and_portable(self):
        for frozen in (False, True):
            with patch.object(sys, 'frozen', frozen, create=True):
                args = parse_options([])
                self.assertTrue(args.browser)
                self.assertFalse(args.kiosk)
                self.assertTrue(args.tray)

    def test_explicit_launch_options(self):
        args = parse_options(['--kiosk'])
        self.assertTrue(args.tray)
        self.assertTrue(args.kiosk)
        self.assertTrue(args.browser)
        args = parse_options(['--no-browser', '--no-tray'])
        self.assertFalse(args.browser)
        self.assertFalse(args.tray)
        self.assertFalse(args.kiosk)
        args = parse_options(['--no-browser', '--kiosk'])
        self.assertFalse(args.browser)
        self.assertTrue(args.kiosk)

    def test_positive_flags_removed(self):
        for options in (['--browser'], ['--tray']):
            with self.subTest(options=options), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                parse_options(options)
