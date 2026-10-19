"""Restart with the same interpreter/executable and startup options after cleanup."""
import os
from pathlib import Path
import subprocess
import sys


def restart_command():
    if getattr(sys, 'frozen', False):
        return [sys.executable, *sys.argv[1:]]
    return [sys.executable, str(Path(__file__).resolve().parent.parent / 'run.py'), *sys.argv[1:]]


def restart_process():
    environment = os.environ.copy()
    if getattr(sys, 'frozen', False):
        # Give the new PyInstaller process an independent application lifetime.
        environment['PYINSTALLER_RESET_ENVIRONMENT'] = '1'
    subprocess.Popen(restart_command(), env=environment)
