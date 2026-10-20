import json
import tempfile
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch
from tools.third_party import include_licenses, safe_relative


class LicensePackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.root, self.bundle, self.python = [self.base/n for n in ('app', 'bundle', 'python')]
        for path in (self.root/'third-party'/'runtime-licenses', self.root/'third-party'/'sources', self.root/'docs', self.bundle, self.python): path.mkdir(parents=True, exist_ok=True)
        for name in ('LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs/LICENSE_REVIEW.md'):
            (self.root/name).write_text('Notice', encoding='utf-8')
        (self.root/'third-party'/'upstream-references.json').write_text('{}', encoding='utf-8')
        (self.python/'LICENSE.txt').write_text('Python terms', encoding='utf-8')
        package = self.base/'site-packages'/'demo'
        package.mkdir(parents=True)
        (package/'__init__.py').write_text('value=1', encoding='utf-8')
        (package/'LICENSE').write_text('Upstream notice', encoding='utf-8')
        metadata = Message();metadata['Name']='demo';metadata['License-Expression']='MIT'
        self.dist = type('Distribution', (), {'metadata':metadata, 'version':'1.0', 'files':[Path('demo/__init__.py'), Path('demo/LICENSE')],
                                             'locate_file':lambda _, p:self.base/'site-packages'/p})()
        self.paths = {str((package/'__init__.py').resolve()).casefold()}

    def tearDown(self): self.temp.cleanup()

    def collect(self):
        with patch('tools.third_party.bundled_paths', return_value=self.paths), patch('tools.third_party.metadata.distributions', return_value=[self.dist]), patch('tools.third_party.sys.base_prefix', str(self.python)):
            return include_licenses(self.bundle, self.root, self.base)

    def test_collect_notices_and_exclude_private_data_from_source(self):
        (self.root/'data').mkdir();(self.root/'data'/'secret.txt').write_text('secret')
        (self.root/'symbol_library_manager.py').write_text('private authoring tool')
        inventory = self.collect()
        self.assertEqual(inventory[0]['name'], 'demo')
        self.assertEqual((self.bundle/'third-party/licenses/demo/demo/LICENSE').read_text(), 'Upstream notice')
        self.assertEqual((self.bundle/'LICENSE').read_text(), 'Notice')
        self.assertFalse((self.bundle/'third-party/application-source.zip').exists())
        self.assertFalse((self.bundle/'data').exists())
        self.assertEqual(json.loads((self.bundle/'third-party/inventory.json').read_text())['packages'][0]['version'], '1.0')

    def test_reciprocal_source_review_is_pending_without_archives(self):
        self.dist.metadata.replace_header('License-Expression', 'LGPL-3.0-only')
        inventory=self.collect()
        self.assertTrue(inventory[0]['source_distribution_review_pending'])
        self.assertFalse((self.bundle/'third-party/sources').exists())

    def test_missing_license_stops_packaging(self):
        self.dist.files = [Path('demo/__init__.py')]
        with self.assertRaisesRegex(ValueError, 'missing license texts'): self.collect()

    def test_source_archives_are_not_copied(self):
        (self.root/'third-party/sources/demo.tar.gz').write_bytes(b'archive')
        self.collect()
        self.assertFalse((self.bundle/'third-party/sources').exists())
        self.assertFalse(list((self.bundle/'third-party').rglob('*.tar.gz')))

    def test_notice_paths_cannot_escape_target(self):
        path = safe_relative('C:/../../LICENSE')
        self.assertFalse(path.is_absolute());self.assertNotIn('..', path.parts);self.assertNotIn(':', str(path))
