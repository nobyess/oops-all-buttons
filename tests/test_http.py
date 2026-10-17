import io
import json
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path
from hmi.service import Service
from hmi.store import Store
from run import make_handler


class HttpTests(unittest.TestCase):
    def test_setup_authentication_and_editor_flow(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            service = Service(Store(Path(folder) / 'test.sqlite3'))
            handler = make_handler(service)
            cookie = ''
            csrf = ''
            def request(path, data=None, authenticated=True):
                headers = {'Content-Type':'application/json'}
                if authenticated:
                    headers.update({'Cookie':cookie, 'X-CSRF-Token':csrf})
                body = b'' if data is None else json.dumps(data).encode()
                headers['Content-Length'] = str(len(body))
                raw = (('GET' if data is None else 'POST') + ' ' + path + ' HTTP/1.0\r\n' +
                       ''.join(f'{key}: {value}\r\n' for key, value in headers.items()) + '\r\n').encode() + body
                class Socket:
                    def __init__(self): self.output = io.BytesIO()
                    def makefile(self, *args): return io.BytesIO(raw)
                    def sendall(self, value): self.output.write(value)
                socket = Socket()
                handler(socket, ('127.0.0.1', 12345), SimpleNamespace())
                head, body = socket.output.getvalue().split(b'\r\n\r\n',1)
                lines = head.decode().split('\r\n')
                response_headers = dict(line.split(': ',1) for line in lines[1:])
                decoded = json.loads(body) if 'application/json' in response_headers.get('Content-Type', '') else body
                return int(lines[0].split()[1]), decoded, response_headers.get('Set-Cookie')
            try:
                self.assertEqual(request('/favicon.ico')[0],204)
                self.assertEqual(request('/favicon.svg')[0],200)
                self.assertEqual(request('/api/tags')[0], 401)
                self.assertEqual(request('/api/admin/status')[0], 401)
                credentials = {'username':'admin','password':'test-password-123'}
                status, _, cookie_header = request('/api/setup', credentials)
                self.assertEqual(status, 200)
                cookie = cookie_header.split(';')[0]
                csrf = request('/api/status')[1]['csrf']
                status, diagnostics, _ = request('/api/admin/status')
                self.assertEqual(status, 200)
                self.assertIn('polling', diagnostics)
                errors=diagnostics['error_log']
                self.assertTrue(any(e['origin']=='HTTP 401 GET /api/tags' and e['message']=='Please sign in' for e in errors))
                request('/api/tags',authenticated=False)
                repeated=request('/api/admin/status')[1]['error_log']
                self.assertEqual(next(e['count'] for e in repeated if e['origin']=='HTTP 401 GET /api/tags'),2)
                self.assertEqual(request('/api/admin/errors/clear',{})[0],200)
                self.assertEqual(request('/api/admin/status')[1]['error_log'],[])
                request('/api/tags',authenticated=False)
                self.assertEqual(request('/api/admin/status')[1]['error_log'][0]['count'],1)
                self.assertEqual(request('/api/admin/session-settings')[1]['mode'], 'fixed')
                self.assertEqual(request('/api/admin/session-settings', {'mode':'never','hours':8})[0], 200)
                self.assertEqual(request('/api/admin/session-settings')[1]['mode'], 'never')
                self.assertEqual(request('/api/session/activity', {})[0], 200)
                self.assertEqual(request('/api/admin/session-settings', {'mode':'invalid','hours':8})[0], 400)
                self.assertGreaterEqual(diagnostics['uptime'], 0)
                self.assertEqual(request('/api/setup', credentials)[0],409)
                self.assertEqual(request('/api/login', {'username':'admin','password':'wrong'})[0],401)
                self.assertEqual(request('/api/sources', {'id':'sim','kind':'memory'}, False)[0],401)
                self.assertEqual(request('/api/sources', {'id':'sim','kind':'memory'})[0],200)
                self.assertEqual(request('/api/tags', {'id':'counter','source':'sim','address':'c'})[0],200)
                status, source_status, _ = request('/api/sources/status')
                self.assertEqual(status, 200)
                self.assertEqual(set(source_status[0]), {'id', 'status'})
                self.assertEqual(request('/api/sources/status', authenticated=False)[0], 401)
                self.assertEqual(request('/api/action', {'tag':'counter','action':'increment','value':2})[1]['value'],2)
                self.assertEqual(request('/api/values')[1]['counter']['value'],2)
                page = {'controls':[{'id':'example','type':'label','text':'Saved'}]}
                self.assertEqual(request('/api/page',page)[0],200)
                self.assertEqual(request('/api/page')[1],page)
                new_page = request('/api/pages/add', {'name': 'Second'})[1]
                self.assertEqual(new_page['name'], 'Second')
                self.assertEqual(len(request('/api/pages')[1]), 2)
                self.assertEqual(request('/api/status')[1]['username'], 'admin')
                from unittest.mock import patch
                from hmi.drivers import DRIVERS
                from hmi.pycomm3_logix import PyComm3LogixDriver
                from test_pycomm3 import FakePLC, SETTINGS
                with patch.dict(DRIVERS, {'pycomm3': lambda settings: PyComm3LogixDriver(settings, FakePLC)}):
                    tested = request('/api/sources/test', {'settings': SETTINGS})
                    self.assertEqual(tested[0], 200)
                    self.assertEqual(request('/api/sources', {'id': 'PLC', 'kind': 'pycomm3', 'settings': SETTINGS,
                                     'test_token': tested[1]['test_token']})[0], 200)
                    self.assertEqual(request('/api/sources/browse', {'source': 'PLC'})[0], 200)
                    self.assertEqual(request('/api/tags', {'id': 'PLCCounter', 'source': 'PLC', 'address': 'Counter'})[0], 200)
                    self.assertEqual(request('/api/tags', {'id': 'Duplicate', 'source': 'PLC', 'address': 'Counter'})[0], 400)
                    self.assertEqual(request('/api/values')[1]['PLCCounter']['quality'], 'bad')
                    service.polling.poll_due(False)
                    self.assertEqual(request('/api/values')[1]['PLCCounter']['value'], 7)
                    batched=request('/api/values/batch', {'source':'PLC','tags':['PLCCounter','unknown'],'pages':['main']})
                    self.assertEqual(batched[0],200)
                    self.assertEqual(set(batched[1]['values']),{'PLCCounter'})
                    self.assertEqual(batched[1]['values']['PLCCounter']['value'],7)
                    self.assertEqual(batched[1]['live'],0.5)
                    self.assertEqual(request('/api/polling/interest', {'client': 'tab', 'tags': ['PLCCounter'], 'pages': []})[0], 200)
                import base64
                image = request('/api/images', {'name': 'test.svg', 'data': base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg"/>').decode()})
                self.assertEqual(image[0], 200)
                asset_id = image[1]['url'].rsplit('/', 1)[-1]
                self.assertEqual(service.store.get('image:' + asset_id)['mime'], 'image/svg+xml')
                fetched = request(image[1]['url'])
                self.assertEqual(fetched[0], 200)
                self.assertEqual(fetched[1], b'<svg xmlns="http://www.w3.org/2000/svg"/>')
                self.assertEqual(request(image[1]['url'], authenticated=False)[0], 401)
                csrf = 'wrong'
                self.assertEqual(request('/api/page',page)[0],403)
                csrf = request('/api/status')[1]['csrf']
                self.assertEqual(request('/api/logout', {})[0],200)
                self.assertEqual(request('/api/tags')[0],401)
            finally:
                pass
