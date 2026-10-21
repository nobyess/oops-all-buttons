"""Exercise a portable build in a disposable copy, never its real data folder."""
import argparse
import http.cookiejar
import json
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


def smoke(bundle):
    with tempfile.TemporaryDirectory(prefix='oab-portable-check-') as directory:
        root = Path(directory) / 'OopsAllButtons'
        shutil.copytree(bundle, root, ignore=shutil.ignore_patterns('data', 'data-before-restore-*'))
        exe = root / 'OopsAllButtons.exe'
        # Optional imports must work inside the frozen executable, without system Python.
        result = subprocess.run([str(exe), '--check-installation'], cwd=directory, timeout=120)
        if result.returncode or not (root / 'data' / 'build-check.json').is_file():
            raise RuntimeError('Frozen dependency check failed:\n' + (root / 'data' / 'server.log').read_text(encoding='utf-8'))
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        cookies = http.cookiejar.CookieJar()
        client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
        token = ''

        def request(path, data=None):
            headers = {'Content-Type': 'application/json', 'X-CSRF-Token': token}
            raw = json.dumps(data).encode() if data is not None else None
            with client.open(urllib.request.Request(base + path, data=raw, headers=headers), timeout=10) as response:
                payload = response.read()
                return json.loads(payload) if response.headers.get_content_type() == 'application/json' else payload

        def start():
            process = subprocess.Popen([str(exe), '--no-browser', '--no-tray', '--port', str(port)], cwd=directory)
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError('Portable server exited:\n' + (root / 'data' / 'server.log').read_text(encoding='utf-8'))
                try:
                    request('/api/status')
                    return process
                except (OSError, urllib.error.URLError):
                    time.sleep(.2)
            process.terminate()
            process.wait(timeout=10)
            raise RuntimeError('Timed out waiting for portable server')

        process = start()
        try:
            assert request('/api/status')['setup'] is True
            assert b'Oops! All Buttons' in request('/')
            assert b'bindControlActions' in request('/control-actions.js')
            assert request('/api/site/logo')[:4] == b'RIFF'
            assert b'textviewer' in request('/controls.js')
            assert b'Startup delay after opening port' in request('/app.js')
            assert request('/images/tray-ok.ico')[:4] == b'\x00\x00\x01\x00'
            request('/api/setup', {'username': 'PortableTest', 'password': 'portable-test-123', 'safety_acknowledged': True})
            status = request('/api/status')
            token = status['csrf']
            pages = request('/api/pages')
            assert len(pages) == 1 and pages[0]['name'] == 'Start Page'
            assert pages[0]['horizontalAlignment'] == 'center'
            assert status['user']['starting_page'] == pages[0]['id']
            demo_tags = {tag['name']: tag for tag in request('/api/tags') if tag['name'].startswith('Demo')}
            assert set(demo_tags) == {'DemoTankLevel', 'DemoPumpEnabled', 'DemoMode'}
            assert all(tag['source'] == 'system' and tag['folder'] == 'Memory' for tag in demo_tags.values())
            assert {asset['name'] for asset in request('/api/assets') if not asset.get('builtin')} == {'Start Page Notes', 'Demo Pump'}
            assert request('/api/admin/assets/capabilities')['can_promote'] is False
            catalog = request('/api/catalog')
            assert {'pycomm3', 'bacnet', 'mqtt', 'modbus', 'database'} <= set(catalog['drivers'])
            interfaces = request('/api/network/interfaces')
            assert isinstance(interfaces, list)
            assert (root / 'data' / 'hmi.sqlite3').is_file()
            assert not (root / 'files' / 'data').exists()
            # Back up, change the account, then stage a restore through the real API.
            backup = request('/api/admin/backup', {})
            request('/api/admin/users/save', {'username': 'AfterBackup', 'password': 'portable-test-456'})
            request('/api/admin/restore', backup)
        finally:
            process.terminate()
            process.wait(timeout=10)
        cookies.clear()
        token = ''
        process = start()
        try:
            assert request('/api/status')['setup'] is False
            request('/api/login', {'username': 'PortableTest', 'password': 'portable-test-123'})
            assert request('/api/status')['authenticated'] is True
            assert 'AfterBackup' not in {user['username'] for user in request('/api/admin/users')}
            assert list(root.glob('data-before-restore-*'))
            assert not (root / 'data.restore.zip').exists()
        finally:
            process.terminate()
            process.wait(timeout=10)
    print('Portable smoke test passed: frozen dependencies/formulas, web assets/logo, setup, drivers, interfaces, data location, backup/restore with restart, retained previous data and login.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    smoke(parser.parse_args().bundle.resolve())
