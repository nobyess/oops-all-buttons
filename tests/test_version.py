import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from hmi.version import application_version

class VersionTests(unittest.TestCase):
    def test_portable_build_metadata_and_missing_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            with patch('hmi.version.sys.frozen',True,create=True),patch('hmi.version.sys.executable',str(root/'app.exe')):
                self.assertEqual(application_version(),'development')
                (root/'VERSION').write_text('0.1.9',encoding='utf-8')
                self.assertEqual(application_version(),'0.1.9')
                (root/'BUILD-INFO.json').write_text('{"version":"0.1.10"}',encoding='utf-8')
                self.assertEqual(application_version(),'0.1.10')
                (root/'BUILD-INFO.json').write_text('[]',encoding='utf-8')
                self.assertEqual(application_version(),'0.1.9')
