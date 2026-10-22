"""Windowless executable entry point. Source users continue to run run.py."""
import ctypes
import sys
import traceback
from pathlib import Path


def show_error(message):
    if sys.platform == 'win32':
        ctypes.windll.user32.MessageBoxW(None, message, 'Oops! All Buttons', 0x10)
    else:
        print(message, file=sys.stderr)


def open_startup_log(directory):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / 'server.log'
    if path.exists() and path.stat().st_size > 1024 * 1024:
        path.replace(directory / 'server.previous.log')
    return path.open('a', encoding='utf-8', buffering=1)


def main():
    from run import application_directory, main as run_server
    from hmi.backup import apply_pending
    restart_requested = False
    log = None
    directory = None
    original_stdout, original_stderr = sys.stdout, sys.stderr
    try:
        directory = application_directory() / 'data'
        # Windows cannot rename the data directory with server.log open inside it.
        # Complete the restore before opening any file in that directory.
        apply_pending(directory)
        log = open_startup_log(directory)
        sys.stdout = sys.stderr = log
        if '--check-installation' in sys.argv:
            import importlib
            import json
            modules = ['waitress', 'BAC0', 'bacpypes3', 'pycomm3', 'paho.mqtt.client', 'pymodbus', 'serial',
                       'formulas', 'ezdxf', 'pystray', 'PIL.Image', 'sqlite3']
            for name in modules:
                importlib.import_module(name)
            import formulas
            result = formulas.Parser().ast('=1+2')[1].compile()()
            if float(result) != 3:
                raise ValueError('Formula calculation check failed')
            (directory / 'build-check.json').write_text(json.dumps({'imports': modules, 'formula': 3}), encoding='utf-8')
            return 0
        restart_requested = run_server() is True
    except Exception as error:
        if log is None and directory is not None:
            try:
                log = open_startup_log(directory)
            except OSError:
                pass
        if log or sys.stderr:
            traceback.print_exc(file=log or sys.stderr)
        if '--check-installation' not in sys.argv:
            show_error(f'Unable to start Oops! All Buttons.\n\n{error}\n\n'
                   'Check data/server.log. Extract the whole portable folder to a writable location. '
                   'If the port is already in use, check whether the server is already running.')
        return 1
    finally:
        if log:
            log.flush()
            sys.stdout, sys.stderr = original_stdout, original_stderr
            log.close()
    if restart_requested:
        try:
            from hmi.restart import restart_process
            restart_process()
        except OSError as error:
            show_error(f'Unable to restart Oops! All Buttons.\n\n{error}\n\nStart the application again manually.')
            return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
