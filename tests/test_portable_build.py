import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

import run
from tools.build_portable import package_bundle, release_version


class PortableBuildTests(unittest.TestCase):
    def test_resources_and_writable_data_have_separate_roots_when_frozen(self):
        with patch.object(sys, 'frozen', True, create=True), patch.object(sys, 'executable', str(Path('portable') / 'OopsAllButtons.exe')):
            self.assertEqual(run.application_directory(), Path('portable').resolve())
        with patch.object(sys, 'frozen', False, create=True):
            self.assertEqual(run.application_directory(), run.ROOT)

    def test_release_zip_and_checksum_and_exclusion_of_live_data(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            bundle = base / 'bundle'
            assets = bundle / '_internal' / 'static'
            assets.mkdir(parents=True)
            (assets / 'index.html').write_text('test', encoding='utf-8')
            (bundle / 'OopsAllButtons.exe').write_bytes(b'test-only')
            archive, checksum = package_bundle(bundle, 'v0.1.0', base / 'release')
            with ZipFile(archive) as zipped:
                self.assertIn('OopsAllButtons/_internal/static/index.html', zipped.namelist())
                self.assertIn('OopsAllButtons/OopsAllButtons.exe', zipped.namelist())
            self.assertEqual(checksum.read_text(encoding='ascii').split()[0], hashlib.sha256(archive.read_bytes()).hexdigest())
            (bundle / 'data').mkdir()
            with self.assertRaisesRegex(ValueError, 'user data'):
                package_bundle(bundle, '0.1.1', base / 'release')

    def test_version_cannot_escape_the_release_directory(self):
        self.assertEqual(release_version('v1.2.3-beta.1'), '1.2.3-beta.1')
        for bad in ['../../secret', 'vNext', '1.2.3/escape', '1.2.3\n--other-option']:
            with self.assertRaises(ValueError):
                release_version(bad)
