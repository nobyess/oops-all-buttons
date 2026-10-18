import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import portable
from hmi.access import Access
from hmi.backup import export_backup, stage_restore, pending_path
from hmi.service import Service
from hmi.store import Store


class PortableRestoreTests(unittest.TestCase):
    def test_restore_finishes_before_log_is_opened(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            directory = root / 'data'
            service = Service(Store(directory / 'hmi.sqlite3'))
            Access(service).save_user({'username': 'Admin', 'password': 'portable-test-123'}, setup=True)
            service.store.set('restore-marker', 'backup value')
            backup = export_backup(service)
            service.store.set('restore-marker', 'old value')
            (directory / 'server.log').write_text('Previous startup\n', encoding='utf-8')
            stage_restore(directory, backup)
            for driver in service.drivers.values():
                driver.close()

            def server():
                self.assertFalse(pending_path(directory).exists())
                self.assertEqual(Store(directory / 'hmi.sqlite3').get('restore-marker'), 'backup value')
                self.assertEqual(len(list(root.glob('data-before-restore-*'))), 1)
                print('Restored server started')

            with patch('run.application_directory', return_value=root), patch('run.main', side_effect=server), patch.object(sys, 'stdout', io.StringIO()), patch.object(sys, 'stderr', io.StringIO()):
                self.assertEqual(portable.main(), 0)
            self.assertIn('Restored server started', (directory / 'server.log').read_text(encoding='utf-8'))
            # A closed log must not prevent a subsequent directory rename on Windows.
            directory.rename(root / 'closed-data')

    def test_restore_failure_is_logged_and_pending_backup_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            directory = root / 'data'
            directory.mkdir()
            pending_path(directory).write_bytes(b'invalid backup')
            with patch('run.application_directory', return_value=root), patch('run.main') as server, patch('portable.show_error') as show_error, patch.object(sys, 'stdout', io.StringIO()), patch.object(sys, 'stderr', io.StringIO()):
                self.assertEqual(portable.main(), 1)
                server.assert_not_called()
                show_error.assert_called_once()
            self.assertTrue(pending_path(directory).exists())
            self.assertIn('Traceback', (directory / 'server.log').read_text(encoding='utf-8'))
