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


def smoke(bundle, passwordless=False):
    with tempfile.TemporaryDirectory(prefix='oab-portable-check-') as directory:
        root = Path(directory) / 'OopsAllButtons'
        shutil.copytree(bundle, root, ignore=shutil.ignore_patterns('data', 'data-before-restore-*'))
        exe = root / 'OopsAllButtons.exe'
        # Optional imports must work inside the frozen executable, without system Python.
        result = subprocess.run([str(exe), '--check-installation'], cwd=directory, timeout=120)
        if result.returncode or not (root / 'data' / 'build-check.json').is_file():
            raise RuntimeError('Frozen dependency check failed:\n' + (root / 'data' / 'server.log').read_text(encoding='utf-8'))
        assert json.loads((root / 'data' / 'build-check.json').read_text())['tray_images'] == 4
        assert json.loads((root / 'data' / 'build-check.json').read_text())['sheet_functions'] == 24
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
            with client.open(base+'/') as response:
                assert response.headers['Server'] == 'OopsAllButtons'
                assert response.headers['X-Content-Type-Options'] == 'nosniff'
                assert "script-src 'self'" in response.headers['Content-Security-Policy']
            try:
                client.open(urllib.request.Request(base+'/api/status',headers={'Host':'untrusted.example'}))
                raise AssertionError('Unknown Host accepted')
            except urllib.error.HTTPError as error:
                assert error.code == 400
                error.close()
            assert b'Oops! All Buttons' in request('/')
            assert b'bindControlActions' in request('/control-actions.js')
            assert request('/api/site/logo')[:4] == b'RIFF'
            assert b'textviewer' in request('/controls.js')
            assert b'Startup delay after opening port' in request('/app.js')
            assert request('/images/tray-ok.ico')[:4] == b'\x00\x00\x01\x00'
            if passwordless:
                request('/api/setup',{'sign_in_required':False,'safety_acknowledged':True})
                status=request('/api/status');token=status['csrf']
                assert status['authenticated'] and status['username']=='User'
                assert request('/api/admin/users')==[]
                backup=request('/api/admin/backup',{})
                request('/api/admin/restore',backup)
                process.terminate();process.wait(timeout=10)
                cookies.clear();token='';process=start()
                status=request('/api/status');token=status['csrf']
                assert status['authenticated'] and status['user']['automatic']
                assert request('/api/admin/users')==[]
                assert list(root.glob('data-before-restore-*'))
                assert not (root/'data.restore.oab-backup').exists()
                # Restore the same account-free backup through fresh-install setup.
                process.terminate();process.wait(timeout=10)
                root=Path(directory)/'FreshTarget'
                shutil.copytree(bundle,root,ignore=shutil.ignore_patterns('data','data-before-restore-*'))
                exe=root/'OopsAllButtons.exe';cookies.clear();token='';process=start()
                assert request('/api/status')['setup'] is True
                request('/api/setup/restore',{**backup,'safety_acknowledged':True})
                process.terminate();process.wait(timeout=10)
                cookies.clear();token='';process=start()
                status=request('/api/status');token=status['csrf']
                assert status['authenticated'] and not status['setup'] and status['username']=='User'
                assert request('/api/admin/users')==[]
                assert not (root/'data.restore.oab-backup').exists()
                print('Portable passwordless backup test passed: account-free export, administrator restore, first-run restore, and automatic access after real restarts.')
                return
            request('/api/setup', {'username': 'PortableTest', 'password': 'portable-test-123', 'safety_acknowledged': True})
            status = request('/api/status')
            token = status['csrf']
            settings=request('/api/admin/server-settings')
            assert settings['port']==port and settings['can_restart'] is True
            assert b'.oab-page' in request('/file-formats.js') and b'.oab-sheet' in request('/file-formats.js')
            assert b'Apply & Restart' not in request('/server-settings.js')
            assert b'admin/site-configuration' in request('/site-settings.js')
            assert b"['Site Configuration','Users','Roles','Server Status','Backup/Restore']" in request('/administration.js')
            assert b'Run without sign-in' in request('/first-run.js')
            assert request('/api/admin/sign-in')['required'] is True
            request('/api/admin/site-configuration',{'sign_in':{'required':False}})
            cookies.clear();status=request('/api/status');token=status['csrf']
            assert status['user']['automatic'] and status['username']=='User'
            request('/api/admin/site-configuration',{'sign_in':{'required':True}})
            cookies.clear();assert not request('/api/status')['authenticated']
            request('/api/login',{'username':'PortableTest','password':'portable-test-123'})
            status=request('/api/status');token=status['csrf']
            assert b'Unpause' in request('/source-manager.js')
            pages = request('/api/pages')
            assert len(pages) == 1 and pages[0]['name'] == 'Start Page'
            assert pages[0]['horizontalAlignment'] == 'center'
            assert pages[0]['gridSize'] == 10
            assert all(c[key] % 10 == 0 for c in pages[0]['controls'] for key in ('left','top','width','height'))
            notes=next(c for c in pages[0]['controls'] if c['type']=='textviewer')
            assert notes['textSource']=='inline' and notes['markdownText'] and not notes['image']
            assert b'mountAssetSelection' in request('/text-viewer-editor.js')
            assert b'filterAssets' in request('/asset-selection.js')
            assert status['user']['starting_page'] == pages[0]['id']
            demo_tags = {tag['name']: tag for tag in request('/api/tags') if tag['name'].startswith('Demo')}
            assert set(demo_tags) == {'DemoTankLevel', 'DemoPumpEnabled', 'DemoMode'}
            assert all(tag['source'] == 'system' and tag['folder'] == 'Memory' for tag in demo_tags.values())
            assert {asset['name'] for asset in request('/api/assets') if not asset.get('builtin')} == {'Demo Pump'}
            assert request('/api/admin/assets/capabilities')['can_promote'] is False
            catalog = request('/api/catalog')
            assert {'pycomm3', 'bacnet', 'mqtt', 'modbus', 'database', 'lightyak', 'simulation'} <= set(catalog['drivers'])
            interfaces = request('/api/network/interfaces')
            assert isinstance(interfaces, list)
            assert (root / 'data' / 'hmi.sqlite3').is_file()
            assert not (root / 'files' / 'data').exists()
            request('/api/sources',{'id':'portable-sheet','name':'Portable Sheet','kind':'sheet','settings':{'filename':'Portable Test'}})
            sheet=request('/api/sheets/save',{'source':'portable-sheet','cells':{
                'A1':{'raw':'1'},'A2':{'raw':'3'},'B1':{'raw':'=AVERAGE(A1:A2)'},
                'B2':{'raw':'=COUNT(A1:A2)'},'C1':{'raw':'=IF(MAX(A1:A2)>2,ROUND(SUM(A1:A2)/3,2),0)'},
                'C2':{'raw':'=AVERAGE("2020-01-01",1)'},'D1':{'raw':'=IFERROR(1/0,99)'}}})
            for cell,value in {'B1':2,'B2':2,'C1':1.33,'C2':21916,'D1':99}.items():
                assert sheet['values'][cell]['quality']=='good' and sheet['values'][cell]['value']==value
            # Back up, change the account, then stage a restore through the real API.
            backup = request('/api/admin/backup', {})
            assert backup['filename'].endswith('.oab-backup')
            request('/api/admin/users/save', {'username': 'AfterBackup', 'password': 'portable-test-456'})
            request('/api/admin/restore', backup)
            assert (root/'data.restore.oab-backup').is_file()
        finally:
            process.terminate()
            process.wait(timeout=10)
        cookies.clear()
        token = ''
        process = start()
        try:
            assert request('/api/status')['setup'] is False
            request('/api/login', {'username': 'PortableTest', 'password': 'portable-test-123'})
            status=request('/api/status');token=status['csrf']
            assert status['authenticated'] is True
            assert 'AfterBackup' not in {user['username'] for user in request('/api/admin/users')}
            restored=request('/api/sheets/get',{'source':'portable-sheet'})
            assert restored['values']['B1']['value']==2 and restored['values']['C2']['value']==21916
            assert list(root.glob('data-before-restore-*'))
            assert not (root / 'data.restore.oab-backup').exists()
            assert not (root / 'data.restore.zip').exists()
        finally:
            process.terminate()
            process.wait(timeout=10)
    print('Portable smoke test passed: frozen dependencies/formulas, tray icons/fallback, web assets/logo, setup, drivers, interfaces, data location, backup/restore with restart, retained previous data and login.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    bundle=parser.parse_args().bundle.resolve()
    smoke(bundle)
    smoke(bundle,passwordless=True)
