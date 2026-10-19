import io
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
import portable
import run
from hmi.restart import restart_command, restart_process

class RestartTests(unittest.TestCase):
    def test_source_and_frozen_commands_keep_options(self):
        with patch.object(sys, 'argv', ['run.py','--tray','--kiosk','--port','8081']), patch.object(sys,'frozen',False,create=True):
            command=restart_command()
            self.assertEqual(command[0],sys.executable)
            self.assertTrue(command[1].endswith('run.py'))
            self.assertEqual(command[2:],sys.argv[1:])
        with patch.object(sys,'frozen',True,create=True), patch.object(sys,'argv',['app.exe','--tray']), patch('hmi.restart.subprocess.Popen') as spawn:
            restart_process()
            self.assertEqual(spawn.call_args.args[0],[sys.executable,'--tray'])
            self.assertEqual(spawn.call_args.kwargs['env']['PYINSTALLER_RESET_ENVIRONMENT'],'1')

    def test_restart_signal_waits_for_server_cleanup(self):
        stopped=threading.Event();calls=[]
        server=SimpleNamespace(shutdown=stopped.set,serve_forever=lambda:stopped.wait(3),server_close=lambda:calls.append('socket closed'))
        service=SimpleNamespace(polling=SimpleNamespace(run=lambda event:None),drivers={'test':SimpleNamespace(close=lambda:calls.append('driver closed'))})
        def tray(*args,**kwargs):kwargs['on_restart']()
        with patch.object(sys,'argv',['run.py','--tray']), patch('run.Service',return_value=service), patch('run.Store'), patch('run.make_handler'), patch('run.apply_pending'), patch('run.ThreadingHTTPServer',return_value=server), patch('run.print_network_interfaces'), patch('hmi.tray.run_tray',side_effect=tray), patch.object(sys,'stdout',io.StringIO()):
            self.assertTrue(run.main())
        self.assertEqual(calls,['socket closed','driver closed'])

    def test_portable_closes_log_before_relaunch(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            def restart():
                # Windows cannot rename this directory if portable's log is open.
                (root/'data').rename(root/'closed-data')
            with patch('run.application_directory',return_value=root), patch('run.main',return_value=True), patch('hmi.backup.apply_pending'), patch('hmi.restart.restart_process',side_effect=restart) as spawn:
                self.assertEqual(portable.main(),0)
                spawn.assert_called_once()
            self.assertTrue((root/'closed-data'/'server.log').exists())

    def test_exit_does_not_relaunch(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch('run.application_directory',return_value=Path(folder)), patch('run.main',return_value=False), patch('hmi.backup.apply_pending'), patch('hmi.restart.restart_process') as spawn:
                self.assertEqual(portable.main(),0)
                spawn.assert_not_called()
