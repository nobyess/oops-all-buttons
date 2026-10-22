"""Restart with the same interpreter/executable and startup options after cleanup."""
import os
from pathlib import Path
import subprocess
import sys


_restart_port=None

def set_restart_port(port):
    global _restart_port
    _restart_port=port

def restart_command():
    arguments=list(sys.argv[1:])
    if _restart_port is not None:
        cleaned=[];skip=False
        for value in arguments:
            if skip:skip=False;continue
            if value=='--port':skip=True;continue
            if value.startswith('--port='):continue
            cleaned.append(value)
        arguments=[*cleaned,'--port',str(_restart_port)]
    if getattr(sys,'frozen',False):return [sys.executable,*arguments]
    return [sys.executable,str(Path(__file__).resolve().parent.parent/'run.py'),*arguments]


def restart_process():
    environment = os.environ.copy()
    if getattr(sys, 'frozen', False):
        # Give the new PyInstaller process an independent application lifetime.
        environment['PYINSTALLER_RESET_ENVIRONMENT'] = '1'
    subprocess.Popen(restart_command(), env=environment)
