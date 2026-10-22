"""Real Waitress transport tests, isolated from project data and physical devices."""
import contextlib
import http.client
import io
import json
import socket
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from wsgiref.util import setup_testing_defaults
from hmi.http_server import HTTPServer
from hmi.web import make_app, RequestLog
from hmi.web_security import Sessions, LoginThrottle, local_hosts, same_origin, valid_host
from hmi.access import Access
from hmi.service import Service
from hmi.store import Store


class WaitressTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.service = Service(Store(Path(self.temp.name)/'test.sqlite3'))
        self.log = RequestLog()
        self.app = make_app(self.service, self.log)
        self.server = HTTPServer(('127.0.0.1', 0), self.app)
        self.port = int(self.server.server.effective_port)
        self.worker = threading.Thread(target=self.server.serve_forever)
        self.worker.start()
        self.cookie = self.csrf = ''

    def tearDown(self):
        self.server.shutdown();self.worker.join(3);self.server.server_close()
        for driver in self.service.drivers.values():driver.close()
        self.temp.cleanup()

    def request(self, path, data=None, headers=None, method=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        body = json.dumps(data) if data is not None else None
        fields = {'Content-Type':'application/json', 'Cookie':self.cookie, 'X-CSRF-Token':self.csrf}
        fields.update(headers or {})
        connection.request(method or ('POST' if data is not None else 'GET'), path, body, fields)
        response = connection.getresponse();raw = response.read();result = dict(response.getheaders())
        status=response.status;connection.close()
        return status, json.loads(raw) if raw and 'application/json' in result.get('Content-Type','') else raw, result

    def setup_user(self):
        code, _, headers=self.request('/api/setup', {'username':'Test', 'password':'test-password-123', 'safety_acknowledged':True})
        self.assertEqual(code,200)
        self.cookie=headers['Set-Cookie'].split(';')[0]
        self.csrf=self.request('/api/status')[1]['csrf']

    def test_live_http_setup_permissions_csrf_and_logout(self):
        self.assertEqual(self.request('/api/tags')[0],401)
        self.setup_user()
        self.assertEqual(self.request('/api/tags')[0],200)
        self.assertEqual(self.request('/api/values/batch', {}, {'Origin':'http://evil.example'})[0],403)
        self.assertEqual(self.request('/api/values/batch', {}, {'X-CSRF-Token':'wrong'})[0],403)
        self.assertEqual(self.request('/api/logout', {})[0],200)
        self.assertEqual(self.request('/api/tags')[0],401)

    def test_keepalive_head_and_security_headers(self):
        connection=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5)
        for method in ('GET','HEAD','GET'):
            connection.request(method,'/app.js')
            response=connection.getresponse();body=response.read()
            self.assertEqual(response.status,200)
            self.assertGreater(int(response.getheader('Content-Length')),100)
            self.assertEqual(response.getheader('X-Content-Type-Options'),'nosniff')
            self.assertEqual(response.getheader('Referrer-Policy'),'same-origin')
            self.assertEqual(bool(body),method!='HEAD')
        connection.close()
        self.assertEqual(self.log.snapshot()['total'],3)
        self.assertEqual(self.request('/',method='DELETE')[0],405)

    def test_untrusted_forwarded_host_and_scheme_cannot_change_boundary(self):
        self.assertEqual(self.request('/api/status',headers={'Host':'evil.example'})[0],400)
        # Untrusted forwarded headers are removed by Waitress.
        self.assertEqual(self.request('/api/status',headers={'X-Forwarded-Host':'evil.example'})[0],200)
        _,_,headers=self.request('/api/setup',{'username':'Test','password':'test-password-123','safety_acknowledged':True}, {'X-Forwarded-Proto':'https'})
        self.assertNotIn('; Secure',headers['Set-Cookie'])

    def test_json_validation_and_route_body_limits(self):
        for value in ([], None, 'wrong', 42):
            # None encoded explicitly rather than used as the helper's GET sentinel.
            connection=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5)
            connection.request('POST','/api/login',json.dumps(value),{'Content-Type':'application/json'})
            response=connection.getresponse();response.read();self.assertEqual(response.status,400);connection.close()
        self.assertEqual(self.request('/api/login',{}, {'Content-Type':'text/plain'})[0],415)
        self.assertEqual(self.request('/api/login', {'x':'a'*1_000_001})[0],400)
        # Header parser cap is enforced before the application.
        self.assertEqual(self.request('/api/status',headers={'X-Large':'a'*17000})[0],431)
        # No enormous body is sent: Waitress rejects its declared size immediately.
        with socket.create_connection(('127.0.0.1',self.port),timeout=5) as peer:
            peer.sendall(b'POST /api/login HTTP/1.1\r\nHost: localhost\r\nContent-Length: 90000001\r\nConnection: close\r\n\r\n')
            self.assertIn(b'413',peer.recv(4096).split(b'\r\n')[0])

    def test_login_throttling(self):
        self.setup_user()
        for _ in range(9):self.assertEqual(self.request('/api/login',{'username':'nope','password':'bad'})[0],401)
        status,_,headers=self.request('/api/login',{'username':'nope','password':'bad'})
        self.assertEqual(status,429);self.assertGreater(int(headers['Retry-After']),0)
        self.assertEqual(self.request('/api/status')[0],200)

    def test_asset_streaming_ranges_and_close(self):
        self.setup_user()
        import base64
        item=self.service.assets.save({'name':'clip','kind':'movie','category':'Tests','filename':'clip.mp4','data':base64.b64encode(b'\x00\x00\x00\x18ftypisom'+b'0123456789'*100000).decode()})
        path='/api/assets/'+item['id']+'/content'
        status,body,headers=self.request(path,headers={'Range':'bytes=19-28'})
        self.assertEqual((status,body),(206,b'7890123456'))
        self.assertEqual(headers['Content-Range'],'bytes 19-28/1000012')
        self.assertEqual(self.request(path,headers={'Range':'bytes=-4'})[:2],(206,b'6789'))
        self.assertEqual(self.request(path,headers={'Range':'bytes=9999999-'})[0],416)
        self.assertEqual(self.request(path,method='HEAD')[1],b'')
        self.assertEqual(len(self.request(path)[1]),1000012)

    def test_get_exceptions_are_safe_and_server_recovers(self):
        self.setup_user()
        with patch.object(self.service,'tag_catalog',side_effect=RuntimeError('private-path-and-secret')):
            with self.assertLogs('hmi.web',level='ERROR'):
                status,body,_=self.request('/api/tags')
        self.assertEqual((status,body),(500,{'error':'Server operation failed'}))
        self.assertEqual(self.request('/api/tags')[0],200)

    def test_shutdown_releases_port_and_workers(self):
        self.server.shutdown();self.worker.join(3);self.server.server_close()
        self.assertFalse(self.worker.is_alive())
        self.assertFalse(self.server.dispatcher.threads)
        replacement=HTTPServer(('127.0.0.1',self.port),self.app)
        replacement.server_close()

    def test_shutdown_finishes_active_response_before_driver_cleanup(self):
        self.server.shutdown();self.worker.join(3);self.server.server_close()
        entered=threading.Event();release=threading.Event()
        def app(env,start):
            entered.set();release.wait(3)
            start('200 OK',[('Content-Length','1000000')])
            return [b'x'*1000000]
        self.server=HTTPServer(('127.0.0.1',0),app)
        self.port=int(self.server.server.effective_port)
        self.worker=threading.Thread(target=self.server.serve_forever);self.worker.start()
        with ThreadPoolExecutor(max_workers=2) as pool:
            response=pool.submit(self.request,'/')
            self.assertTrue(entered.wait(3))
            self.server.shutdown();self.worker.join(3)
            closer=pool.submit(self.server.server_close)
            release.set()
            self.assertEqual(len(response.result(5)[1]),1000000)
            closer.result(5)
        self.assertFalse(self.server.dispatcher.threads)

    def test_bind_failure_cleans_worker_pool(self):
        from waitress.task import ThreadedTaskDispatcher
        dispatcher=ThreadedTaskDispatcher()
        with patch('hmi.http_server.ThreadedTaskDispatcher',return_value=dispatcher):
            with self.assertRaises(OSError):HTTPServer(('127.0.0.1',self.port),self.app)
        self.assertFalse(dispatcher.threads)

    def test_trusted_proxy_https_cookie_and_origin(self):
        self.server.shutdown();self.worker.join(3);self.server.server_close()
        self.server=HTTPServer(('127.0.0.1',0),make_app(self.service,allowed_hosts={'localhost','hmi.example'}),trusted_proxy='127.0.0.1')
        self.port=int(self.server.server.effective_port)
        self.worker=threading.Thread(target=self.server.serve_forever);self.worker.start()
        headers={'Host':'localhost','X-Forwarded-Host':'hmi.example','X-Forwarded-Proto':'https','X-Forwarded-For':'192.0.2.10','Origin':'https://hmi.example'}
        code,_,response=self.request('/api/setup',{'username':'Test','password':'test-password-123','safety_acknowledged':True},headers)
        self.assertEqual(code,200);self.assertIn('; Secure',response['Set-Cookie'])
        self.assertEqual(self.request('/api/login',{'username':'Test','password':'test-password-123'},{**headers,'Origin':'http://hmi.example'})[0],403)


class SecurityStateTests(unittest.TestCase):
    def test_origin_and_host_validation(self):
        env={'HTTP_HOST':'localhost:8080','wsgi.url_scheme':'http'}
        self.assertTrue(same_origin('http://localhost:8080',env))
        for value in ('null','http://localhost:8080/','https://localhost:8080','http://evil@localhost:8080','http://localhost:8081'):
            self.assertFalse(same_origin(value,env),value)
        for value in ('localhost@evil','localhost/path','localhost:bad','localhost\r\nInjected:x','localhost,evil'):
            self.assertFalse(valid_host(value,{'localhost'}),value)
        self.assertTrue(valid_host('[::1]:8080',{'::1'}))
        self.assertIn('example.test',local_hosts('127.0.0.1',['example.test']))

    def test_session_caps_copy_activity_expiry_and_revision(self):
        with tempfile.TemporaryDirectory() as folder:
            service=Service(Store(Path(folder)/'test.sqlite3'));access=Access(service)
            user=access.save_user({'username':'Test','password':'test-password-123'},setup=True)
            sessions=Sessions(access,service,maximum=3,per_user=2)
            for token in ('one','two','three'):sessions.add(token,user)
            self.assertIsNone(sessions.get_cookie('session=one'))
            record=sessions.get_cookie('session=two');record['activity']=0
            self.assertNotEqual(sessions.get_cookie('session=two')['activity'],0)
            sessions.update(record,activity=123)
            self.assertEqual(sessions.get_cookie('session=two')['activity'],123)
            sessions.records['two']['created']=0
            self.assertIsNone(sessions.get_cookie('session=two'))
            access.save_user({'id':user['id'],'username':'Test','password':'new-password-123','administrator':True},access.public(user))
            self.assertIsNone(sessions.get_cookie('session=three'))
            for driver in service.drivers.values():driver.close()

    def test_throttle_is_bounded_and_expires(self):
        throttle=LoginThrottle(per_ip=2,total=4,maximum=2)
        with patch('hmi.web_security.time.monotonic',return_value=100):
            self.assertEqual(throttle.attempt('a'),0);self.assertEqual(throttle.attempt('a'),0)
            self.assertGreater(throttle.attempt('a'),0)
            throttle.attempt('b');throttle.attempt('c')
            self.assertLessEqual(len(throttle.buckets),2)
            self.assertGreater(throttle.attempt('d'),0)
        with patch('hmi.web_security.time.monotonic',return_value=161):self.assertEqual(throttle.attempt('a'),0)
