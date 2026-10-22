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
            from hmi.sheet_engine import load_engine
            formulas = load_engine()
            result = formulas.Parser().ast('=1+2')[1].compile()()
            if float(result) != 3:
                raise ValueError('Formula calculation check failed')
            cases = [
                ('SUM(1,2,3)',6), ('AVERAGE(2,4,6)',4), ('MIN(2,4)',2), ('MAX(2,4)',4),
                ('IF(2>1,"yes","no")','yes'), ('AND(1=1,2=2)',True),
                ('OR(1=0,2=2)',True), ('NOT(1=0)',True), ('ABS(-7)',7),
                ('ROUND(1.235,2)',1.24), ('ROUNDUP(1.231,2)',1.24),
                ('ROUNDDOWN(1.239,2)',1.23), ('LEN("hello")',5),
                ('LEFT("hello",2)','he'), ('RIGHT("hello",2)','lo'), ('MID("hello",2,3)','ell'),
                ('CONCATENATE("he","llo")','hello'), ('CONCAT("he","llo")','hello'),
                ('TRIM(" hello ")','hello'), ('UPPER("hello")','HELLO'),
                ('LOWER("HELLO")','hello'), ('COUNT(1,2,3)',3), ('COUNTA(1,2,3)',3),
                ('IFERROR(1/0,99)',99),
            ]
            for expression, expected in cases:
                value = formulas.Parser().ast('='+expression)[1].compile()()
                if hasattr(value,'item'):value=value.item()
                if value != expected:raise ValueError('Sheet function check failed: '+expression)
            # Numeric coercion can use the date parser even without date functions.
            coerced=formulas.Parser().ast('=AVERAGE("2020-01-01",1)')[1].compile()()
            if float(coerced)!=21916:raise ValueError('Sheet date coercion check failed')
            if getattr(sys,'frozen',False) and importlib.util.find_spec('scipy') is not None:
                raise ValueError('Unused SciPy was included in the portable build')
            # Exercise the frozen tray image path, including ICO encoding and the
            # native Windows icon handle, without displaying a tray notification.
            import pystray
            from hmi.tray import run_tray
            original_icon = pystray.Icon
            checked_icons = []
            class CheckIcon(original_icon):
                def run(self):
                    self._assert_icon_handle()
                    if not self._icon_handle:
                        raise ValueError('Tray icon handle could not be created')
                    self._release_icon()
                    checked_icons.append(True)
            try:
                pystray.Icon = CheckIcon
                images = Path(__file__).resolve().parent / 'static' / 'images'
                for name in ('tray-ok.ico', 'tray-hm.ico', 'tray-ow.ico'):
                    icon_path = images / name
                    if not icon_path.is_file():raise ValueError('Missing tray icon: '+name)
                    run_tray('http://localhost', icon_path=icon_path)
                run_tray('http://localhost')  # Fallback drawing/font support.
            finally:
                pystray.Icon = original_icon
            (directory / 'build-check.json').write_text(json.dumps({'imports': modules, 'formula': 3, 'sheet_functions':len(cases), 'tray_images': len(checked_icons)}), encoding='utf-8')
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
