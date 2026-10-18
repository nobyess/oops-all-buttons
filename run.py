"""Run: python run.py [--tray] [--no-browser] [--host 127.0.0.1] [--port 8080]."""
import argparse
import platform
import hashlib
import hmac
import json
import secrets
import sys
import threading
import time
import webbrowser
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer as BaseThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from hmi.system_stats import system_memory
from hmi.access import Access
from hmi.session_settings import session_settings, session_valid
from hmi.network import local_interfaces
from hmi.actions import ACTIONS
from hmi.drivers import DRIVERS
from hmi.service import Service
from hmi.store import Store
from hmi.backup import export_backup, stage_restore, apply_pending, pending_path

ROOT = Path(__file__).resolve().parent


class ThreadingHTTPServer(BaseThreadingHTTPServer):
    # Login/module loads and independent source timers can arrive together.
    # The stdlib backlog of five can force TCP retries even on localhost.
    request_queue_size = 128


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600_000).hex()


class RequestLog:
    """Thread-safe request statistics; normal access requests stay off the terminal."""
    def __init__(self):
        self.lock = threading.Lock()
        self.recent = []
        self.total = self.errors = 0

    def record(self, method, path, status):
        with self.lock:
            error = str(status).isdigit() and int(status) >= 400
            self.total += 1
            self.errors += int(error)
            self.recent.append((time.monotonic(), method, int(error)))
            self.recent = [entry for entry in self.recent if entry[0] > time.monotonic() - 1]

    def snapshot(self):
        with self.lock:
            recent = [entry for entry in self.recent if entry[0] > time.monotonic() - 1]
            return {'total': self.total, 'errors': self.errors,
                    'last_second': len(recent), 'errors_last_second': sum(entry[2] for entry in recent)}


def make_handler(service, request_log=None):
    started = time.monotonic()
    access = Access(service) if service is not None else None
    sessions = {}
    auth_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_request(self, code='-', size='-'):
            if service is not None and str(code).isdigit() and int(code) >= 400:
                service.error_log.record(f'HTTP {code} {self.command} {urlsplit(self.path).path}', getattr(self, 'error_detail', '') or 'Request failed')
            if request_log is not None:
                request_log.record(self.command, self.path, code)
                return
            super().log_request(code, size)

        def reply(self, status, data, cookie=None):
            body = json.dumps(data, allow_nan=False).encode()
            self.error_detail = str(data.get('error', '')) if status >= 400 and isinstance(data, dict) else ''
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            if cookie:
                self.send_header('Set-Cookie', cookie)
            self.end_headers()
            self.wfile.write(body)

        def session(self):
            cookie = SimpleCookie()
            cookie.load(self.headers.get('Cookie', ''))
            token = cookie.get('session')
            record = sessions.get(token.value) if token else None
            if not record:return None
            user=access.current(record)
            if user is None:return None
            if not session_valid(record, session_settings(user.get('session_settings',service.store.get('session_settings', {})))):return None
            record['user']=access.public(user)
            if record.get('kiosk_exited') and user['administrator']:record['user']['kiosk']=False
            return record

        def do_GET(self):
            path = urlsplit(self.path).path
            if path.startswith('/api/symbols/'):
                if not self.session():
                    return self.reply(401, {'error': 'Please sign in'})
                asset = service.store.get('image:' + path.rsplit('/', 1)[-1])
                if not asset:
                    return self.reply(404, {'error': 'Symbol not found'})
                from hmi.symbols import prepare_symbol
                try:
                    tree = asset.get('symbol') or prepare_symbol(asset)['symbol']
                except ValueError as error:
                    return self.reply(400, {'error': str(error)})
                return self.reply(200, tree)
            if path.startswith('/api/images/') or path == '/api/site/logo':
                if path != '/api/site/logo' and not self.session():
                    return self.reply(401, {'error': 'Please sign in'})
                import base64
                asset = service.store.get('site_logo') if path == '/api/site/logo' else service.store.get('image:' + path.rsplit('/', 1)[-1])
                if not asset and path == '/api/site/logo':
                    default_logo = ROOT / 'static' / 'images' / 'default-logo.png'
                    if default_logo.is_file():
                        asset = {'mime':'image/png','data':base64.b64encode(default_logo.read_bytes()).decode('ascii')}
                if not asset:
                    return self.reply(404, {'error': 'Image not found'})
                body = base64.b64decode(asset['data'])
                self.send_response(200)
                self.send_header('Content-Type', asset['mime'])
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Cache-Control', 'no-store')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'")
                self.end_headers()
                return self.wfile.write(body)
            if path == '/api/status':
                record = self.session()
                return self.reply(200, {'setup': not access.users(),
                                       'site_logo':bool(service.store.get('site_logo')) or (ROOT/'static'/'images'/'default-logo.png').is_file(),
                                       'authenticated': bool(record), 'csrf': record['csrf'] if record else None,
                                       'username': record['user']['username'] if record else None,
                                       'user': record['user'] if record else None})
            if path.startswith('/api/'):
                record=self.session()
                if not record:
                    return self.reply(401, {'error': 'Please sign in'})
                user=record['user']
                if (not user['administrator'] or user['kiosk']) and (path.startswith('/api/admin/') or path in ('/api/network/interfaces','/api/sources/status','/api/database/files')):
                    return self.reply(403, {'error':'Administrator access required'})
                if user['kiosk'] and path not in {'/api/pages','/api/sources','/api/tags','/api/catalog','/api/access/roles','/api/values','/api/control-state','/api/events/status','/api/alarms/attention'}:
                    return self.reply(403, {'error':'Kiosk Mode allows live views only'})
                routes = {
                    '/api/access/roles': access.roles,
                    '/api/alarms': lambda: service.alarm_snapshot(user),
                    '/api/alarms/attention': lambda: service.alarm_attention(user),
                    '/api/admin/users': lambda: [access.public(u) for u in access.users()],
                    '/api/admin/backup/status': lambda: {'pending':pending_path(Path(service.store.path).parent).exists()},
                    '/api/admin/site': lambda: {'logo_name':(service.store.get('site_logo') or {}).get('name',''), 'default_logo':(ROOT/'static'/'images'/'default-logo.png').is_file()},
                    '/api/admin/session-settings': lambda: session_settings(service.store.get('session_settings', {})),
                    '/api/admin/status': lambda: {
                        'uptime': time.monotonic() - started, 'cpu_seconds': time.process_time(),
                        'python': platform.python_version(), 'platform': platform.system(),
                        'memory': system_memory(), 'threads': threading.active_count(), 'database_bytes': Path(service.store.path).stat().st_size,
                        'requests': request_log.snapshot() if request_log else {},
                        'error_log': service.error_log.snapshot(),
                        'polling': service.polling.diagnostics(),
                        'sources': service.source_diagnostics(),
                        'tags': len(service.tags()), 'pages': len(service.pages())},
                    '/api/sources': lambda: service.source_catalog() if user['administrator'] and not user['kiosk'] else [{**source,'settings':{k:v for k,v in source['settings'].items() if k in ('live','background')},'status':{'quality':source['status'].get('quality'),'message':'Source status'},'usage':[]} for source in service.source_diagnostics()],
                    '/api/sources/status': service.source_status,
                    '/api/network/interfaces': local_interfaces,
                    '/api/tags': service.tag_catalog,
                    '/api/pages': service.page_catalog,
                    '/api/control-state': lambda: {},
                    '/api/events/status': lambda: [],
                    '/api/values': service.values,
                    '/api/page': lambda: service.store.get('page', {'controls': []}),
                    '/api/database/files': lambda: sorted(p.name for p in (Path(service.store.path).parent/'databases').glob('*') if p.is_file() and p.suffix.lower() in ('.db','.sqlite','.sqlite3')),
                    '/api/catalog': lambda: {'drivers': [kind for kind in DRIVERS if kind not in ('memory','system')], 'actions': {
                        key: {'label': action.label, 'needs_value': action.needs_value}
                        for key, action in ACTIONS.items()}},
                }
                return self.reply(200, routes[path]()) if path in routes else self.reply(404, {'error': 'Not found'})
            if path == '/favicon.ico':
                self.send_response(204)
                self.send_header('Content-Length', '0')
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.end_headers()
                return
            relative = 'index.html' if path == '/' else path.lstrip('/')
            file = (ROOT / 'static' / relative).resolve()
            if not file.is_relative_to((ROOT / 'static').resolve()) or not file.is_file():
                return self.reply(404, {'error': 'Not found'})
            types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png':'image/png'}
            body = file.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', types.get(file.suffix, 'application/octet-stream'))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            try:
                # Reject cross-origin browser writes, including first-run setup/login.
                origin = self.headers.get('Origin')
                if origin and origin != 'http://' + self.headers.get('Host', ''):
                    return self.reply(403, {'error': 'Origin rejected'})
                length = int(self.headers.get('Content-Length', 0))
                limit = 90_000_000 if urlsplit(self.path).path in ('/api/admin/restore','/api/setup/restore') else 16_000_000 if urlsplit(self.path).path == '/api/pages/import' else 7_100_000 if urlsplit(self.path).path in ('/api/images','/api/admin/site') else 1_000_000
                if not 0 < length <= limit:
                    raise ValueError('Invalid request size')
                data = json.loads(self.rfile.read(length))
                path = urlsplit(self.path).path
                if path == '/api/setup/restore':
                    with auth_lock:
                        if access.users():return self.reply(409,{'error':'Setup is already complete'})
                        if data.get('safety_acknowledged') is not True:raise ValueError('Acknowledge the equipment safety notice before restoring')
                        return self.reply(200,stage_restore(Path(service.store.path).parent,data))
                if path in ('/api/setup', '/api/login'):
                    with auth_lock:
                        username = str(data['username']).strip()
                        password = str(data['password'])
                        if path == '/api/setup':
                            if access.users():return self.reply(409, {'error':'Setup is already complete'})
                            if data.get('safety_acknowledged') is not True:
                                return self.reply(400, {'error':'Acknowledge the equipment safety notice before creating an administrator'})
                            user=access.save_user({'username':username,'password':password},setup=True)
                        else:
                            user=access.login(username,password)
                            if user is None:return self.reply(401, {'error':'Invalid username or password'})
                        token=secrets.token_urlsafe(32)
                        sessions[token]={'csrf':secrets.token_urlsafe(32),'created':time.time(),'activity':time.time(),'user_id':user['id'],'revision':user['revision']}
                        return self.reply(200, {'ok':True}, f'session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000')
                record = self.session()
                if not record:
                    return self.reply(401, {'error': 'Please sign in'})
                if not hmac.compare_digest(self.headers.get('X-CSRF-Token', ''), record['csrf']):
                    return self.reply(403, {'error': 'Invalid session token'})
                user=record['user']
                allowed={'/api/logout','/api/user/preferences','/api/session/activity','/api/session/kiosk/exit','/api/values/batch','/api/polling/interest','/api/rules/validate','/api/action','/api/actions/authorize','/api/actions/listbox','/api/sheets/get','/api/alarms/silence'}
                allowed.add('/api/alarms/history')
                if (not user['administrator'] or user['kiosk']) and (path not in allowed or (user['kiosk'] and path=='/api/sheets/get')):
                    return self.reply(403, {'error':'Administrator access required'})
                if path == '/api/admin/backup':
                    return self.reply(200,export_backup(service))
                if path == '/api/admin/site':
                    from hmi.images import prepare_image
                    if 'logo' not in data:raise ValueError('Choose a logo image')
                    asset=prepare_image(data['logo']) if data['logo'] is not None else None
                    service.store.set('site_logo',asset)
                    return self.reply(200,{'logo_name':asset['name'] if asset else ''})
                if path == '/api/admin/restore':
                    with auth_lock:
                        return self.reply(200,stage_restore(Path(service.store.path).parent,data))
                if path == '/api/alarms/history':
                    return self.reply(200,service.alarm_history(data))
                if path == '/api/alarms/silence':
                    if user['kiosk'] and (data.get('all') or not data.get('id') or not data.get('occurrence')):
                        return self.reply(403,{'error':'Kiosk Mode allows silencing individual alarm occurrences only'})
                    return self.reply(200,service.silence_alarms(data,user))
                if path == '/api/admin/alarms/save':
                    return self.reply(200,service.save_alarm(data))
                if path == '/api/admin/alarms/remove':
                    service.remove_alarm(data);return self.reply(200,{'ok':True})
                if path == '/api/user/preferences':
                    return self.reply(200, access.preferences(user['id'],data))
                if path == '/api/session/kiosk/exit':
                    if not user['administrator']:raise PermissionError('Administrator access required to exit Kiosk Mode')
                    record['kiosk_exited']=True
                    return self.reply(200, {'ok':True})
                if path == '/api/admin/users/save':
                    return self.reply(200, access.public(access.save_user(data,user)))
                if path == '/api/admin/users/remove':
                    access.remove_user(data['id'],user);return self.reply(200, {'ok':True})
                if path == '/api/admin/roles/save':
                    return self.reply(200, access.save_role(data))
                if path == '/api/admin/roles/remove':
                    access.remove_role(data['id']);return self.reply(200, {'ok':True})
                if path == '/api/actions/authorize':
                    return self.reply(200, access.authorize(user,data))
                if path == '/api/actions/listbox':
                    return self.reply(200, {'value':service.act(access.listbox_action(user,data))})
                if path == '/api/logout':
                    cookie = SimpleCookie(self.headers.get('Cookie', ''))
                    sessions.pop(cookie['session'].value, None)
                    return self.reply(200, {'ok': True}, 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
                if path == '/api/admin/errors/clear':
                    service.error_log.clear()
                    return self.reply(200, {'ok': True})
                if path == '/api/admin/session-settings':
                    service.store.set('session_settings', session_settings(data))
                    return self.reply(200, {'ok': True})
                if path == '/api/session/activity':
                    record['activity'] = time.time()
                    return self.reply(200, {'ok': True})
                if path == '/api/sources':
                    if data.get('kind') in ('memory','system'):raise ValueError('Use the built-in System source for Memory tags')
                    service.add_source(data)
                elif path == '/api/sources/edit':
                    service.edit_source(data)
                elif path == '/api/values/batch':
                    return self.reply(200, service.batch_values(data))
                elif path == '/api/tags/edit':
                    service.edit_tag(data)
                elif path == '/api/sources/auto-select':
                    from hmi.pycomm3_modes import auto_select
                    return self.reply(200, auto_select(data.get('settings', {})))
                elif path == '/api/sources/test':
                    return self.reply(200, service.test_source(data))
                elif path == '/api/sources/preview-tag':
                    return self.reply(200, service.preview_source_tag(data))
                elif path == '/api/modbus/read':
                    source = next((source for source in service.sources() if source['id'] == data.get('source') and source['kind'] == 'modbus'), None)
                    if not source:raise ValueError('Choose a Modbus TCP source')
                    driver = service.drivers.get(source['id'])
                    if not driver:raise ValueError('Source unavailable')
                    return self.reply(200, {'value': driver.read(data.get('address',''))})
                elif path == '/api/mqtt/discover':
                    source = next((source for source in service.sources() if source['id'] == data.get('source') and source['kind'] == 'mqtt'), None)
                    driver = service.drivers.get(source['id']) if source else None
                    token = str(data.get('client', ''))
                    if driver is None or not token or len(token) > 100:
                        raise ValueError('Choose an available MQTT source and a discovery client')
                    result = driver.discovery(record['csrf'] + ':' + token, data.get('action', 'read'), data.get('filter', '#'))
                    added = {tag['address'] for tag in service.tags() if tag['source'] == source['id']}
                    for item in result.get('items', []):
                        item['added'] = item['topic'] in added
                    return self.reply(200, result)
                elif path == '/api/sources/browse':
                    return self.reply(200, service.browse_source(data))
                elif path == '/api/sheets/export':
                    return self.reply(200, service.export_sheet(data))
                elif path == '/api/sheets/import':
                    return self.reply(200, service.import_sheet(data))
                elif path == '/api/sheets/remove':
                    return self.reply(200, service.delete_sheet(data))
                elif path == '/api/sheets/get':
                    return self.reply(200, service.get_sheet(data))
                elif path == '/api/sheets/save':
                    return self.reply(200, service.save_sheet(data))
                elif path == '/api/polling/interest':
                    client = str(data.get('client', ''))
                    if not client or len(client) > 100:
                        raise ValueError('Invalid polling client')
                    return self.reply(200, service.live_interest(record['csrf'] + ':' + client, data))
                elif path == '/api/sources/remove':
                    service.remove_source(data)
                elif path == '/api/tags/remove':
                    service.remove_tag(data)
                elif path == '/api/pages':
                    return self.reply(200, {'ok': True, 'warnings': service.save_page(data)})
                elif path == '/api/images':
                    from hmi.images import prepare_image
                    if data.get('symbol'):
                        from hmi.symbols import prepare_symbol
                        asset = prepare_symbol(data)
                        if data.get('prepare_only'):
                            return self.reply(200, {'symbol':asset['symbol']})
                    else:
                        asset = prepare_image(data)
                    service.store.set('image:' + asset['id'], asset)
                    return self.reply(200, {'url': '/api/images/' + asset['id'], 'name': asset['name']})
                elif path == '/api/rules/validate':
                    service.validate_rule(data['kind'], data['item'])
                elif path == '/api/pages/export':
                    from hmi.page_transfer import export_page
                    return self.reply(200, export_page(service, data))
                elif path == '/api/pages/import':
                    from hmi.page_transfer import import_page
                    return self.reply(200, import_page(service, data))
                elif path == '/api/pages/add':
                    return self.reply(200, service.add_page(data))
                elif path == '/api/pages/remove':
                    service.remove_page(data)
                elif path == '/api/tags':
                    service.add_tag(data)
                elif path == '/api/action':
                    if data.get('_access'):data=access.authorize(user,data)
                    elif not user['administrator'] or user['kiosk']:raise PermissionError('A saved action reference is required')
                    return self.reply(200, {'value': service.act(data)})
                elif path == '/api/page':
                    if not isinstance(data.get('controls'), list):
                        raise ValueError('Page requires a controls list')
                    service.store.set('page', data)
                else:
                    return self.reply(404, {'error': 'Not found'})
                self.reply(200, {'ok': True})
            except PermissionError as exc:
                self.reply(403, {'error':str(exc)})
            except (ValueError, KeyError, TypeError) as exc:
                self.reply(400, {'error': str(exc)})
            except Exception as exc:
                service.error_log.record('Server operation', type(exc).__name__ + ': ' + str(exc))
                self.log_error('Operation failed')
                self.reply(500, {'error': 'Server operation failed'})

    return Handler


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--tray', action='store_true')
    args = parser.parse_args()
    apply_pending(ROOT / 'data')
    service = Service(Store(ROOT / 'data' / 'hmi.sqlite3'))
    request_log = RequestLog()
    server = ThreadingHTTPServer((args.host, args.port), make_handler(service, request_log))
    stopped = threading.Event()
    polling_worker = threading.Thread(target=service.polling.run, args=(stopped,), daemon=True)
    polling_worker.start()
    browser_host = '127.0.0.1' if args.host in ('', '0.0.0.0') else args.host
    url = f'http://{browser_host}:{args.port}'
    print(f'Oops! All Buttons: {url} (bind: {args.host}); Ctrl+C stops server')
    print_network_interfaces()
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    if args.tray:
        from hmi.tray import run_tray
        threading.Thread(target=run_tray, args=(url,), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stopped.set()
        polling_worker.join(timeout=2)
        server.server_close()
        for driver in service.drivers.values():
            driver.close()


if __name__ == '__main__':
    main()
