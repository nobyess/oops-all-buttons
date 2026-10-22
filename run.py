"""Run: python run.py [--no-tray] [--kiosk] [--no-browser] [--host 127.0.0.1] [--port 8080]."""
import argparse
import sys
import threading
from pathlib import Path
from hmi.browser_launch import launch_browser
from hmi.network import local_interfaces
from hmi.service import Service
from hmi.store import Store
from hmi.backup import apply_pending
from hmi.web import RequestLog, make_app
from hmi.http_server import HTTPServer
from hmi.web_security import local_hosts

ROOT = Path(__file__).resolve().parent


def application_directory():
    """Bundled resources are read-only; portable data lives beside the executable."""
    return Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else ROOT


def print_network_interfaces():
    print('Network interfaces (IPv4):')
    try:
        interfaces = local_interfaces()
    except Exception as error:
        print(f'  Unable to list interfaces: {error}')
        return
    if not interfaces:
        print('  No active network interfaces found.')
    for interface in interfaces:
        print(f"  {interface['name']}: {interface['address']}")


def parse_options(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--no-browser', dest='browser', action='store_false', help='Do not open a browser at startup')
    parser.add_argument('--kiosk', action='store_true', help='Use a fullscreen browser without browser chrome (Edge/Chrome/Chromium)')
    parser.add_argument('--no-tray', dest='tray', action='store_false', help='Do not show the desktop tray icon')
    parser.add_argument('--allowed-host', action='append', default=[], help='Additional hostname accepted in browser requests (repeatable)')
    parser.add_argument('--trusted-proxy', help='Exact IP address of a trusted HTTPS reverse proxy')
    return parser.parse_args(argv)


def main():
    args = parse_options()
    data_directory = application_directory() / 'data'
    apply_pending(data_directory)
    store=Store(data_directory / 'hmi.sqlite3')
    from hmi.server_settings import ServerSettings
    settings=ServerSettings(store)
    args.port=settings.startup_port(args.port,explicit=any(value=='--port' or value.startswith('--port=') for value in sys.argv[1:]))
    settings.port=args.port;settings.host=args.host
    service = Service(store, initialize_starter=True)
    service.server_settings=settings
    request_log = RequestLog()
    try:
        hosts = local_hosts(args.host, args.allowed_host)
        server = HTTPServer((args.host, args.port), make_app(service, request_log, ROOT, hosts), trusted_proxy=args.trusted_proxy)
    except BaseException:
        for driver in service.drivers.values():driver.close()
        raise
    stopped = threading.Event()
    restart_requested = threading.Event()
    polling_worker = threading.Thread(target=service.polling.run, args=(stopped,), daemon=True)
    polling_worker.start()
    browser_host = '127.0.0.1' if args.host in ('', '0.0.0.0', '::') else args.host
    if ':' in browser_host:browser_host = '[' + browser_host + ']'
    url = f'http://{browser_host}:{args.port}'
    print(f'Oops! All Buttons: {url} (bind: {args.host}); Ctrl+C stops server')
    print_network_interfaces()
    def launch():
        try:
            launch_browser(url, kiosk=args.kiosk)
        except (OSError, RuntimeError) as error:
            print(f'Unable to launch browser: {error}')
            service.error_log.record('Browser launch', str(error))
            if getattr(sys, 'frozen', False):
                from portable import show_error
                show_error(str(error))
    browser_timer = threading.Timer(0.5, launch) if args.browser else None
    if browser_timer:
        browser_timer.daemon = True
        browser_timer.start()
    def request_restart(port=None):
        if port is not None:
            from hmi.restart import set_restart_port
            set_restart_port(port)
        restart_requested.set()
        server.shutdown()
    settings.restart=request_restart
    if args.tray:
        from hmi.tray import run_tray
        def tray_worker():
            try:
                run_tray(url, on_exit=server.shutdown, icon_path=ROOT / 'static' / 'images' / 'tray-ok.ico', launch=launch, on_restart=request_restart)
            except Exception:
                import traceback
                traceback.print_exc()
                # A windowless portable server must not remain invisible after tray failure.
                if getattr(sys, 'frozen', False):
                    from portable import show_error
                    show_error('The tray could not start. See data/server.log for details.')
                    server.shutdown()
        threading.Thread(target=tray_worker, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if browser_timer:browser_timer.cancel()
        stopped.set()
        polling_worker.join(timeout=2)
        server.server_close()
        for driver in service.drivers.values():
            driver.close()
    return restart_requested.is_set()


if __name__ == '__main__':
    if main():
        from hmi.restart import restart_process
        restart_process()
