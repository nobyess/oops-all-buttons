"""Small WSGI request/response primitives; HTTP parsing belongs to Waitress."""
import io
from email.message import Message
from http import HTTPStatus
from urllib.parse import urlsplit
from hmi.web_security import valid_host


class FileRange:
    def __init__(self, path, start, length):
        self.stream = path.open('rb')
        self.stream.seek(start)
        self.left = length

    def __iter__(self):
        return self

    def __next__(self):
        if self.left <= 0:
            raise StopIteration
        chunk = self.stream.read(min(self.left, 65536))
        if not chunk:
            raise StopIteration
        self.left -= len(chunk)
        return chunk

    def close(self):
        self.stream.close()


class Request:
    def __init__(self, environ):
        self.environ = environ
        self.command = environ['REQUEST_METHOD']
        self.path = environ.get('PATH_INFO', '/')
        if environ.get('QUERY_STRING'):
            self.path += '?' + environ['QUERY_STRING']
        self.headers = Message()
        for key, value in environ.items():
            if key.startswith('HTTP_'):
                self.headers[key[5:].replace('_', '-')] = value
        for key in ('CONTENT_TYPE', 'CONTENT_LENGTH'):
            if environ.get(key):self.headers[key.replace('_', '-')] = environ[key]
        self.rfile = environ['wsgi.input']
        self.wfile = io.BytesIO()
        self.body = None
        self.status = 200
        self.response_headers = {}

    def send_response(self, status):
        self.status = status

    def send_header(self, name, value):
        self.response_headers[name] = str(value)

    def end_headers(self):
        pass

    def log_error(self, message):
        # Detailed exceptions are recorded in the application's bounded error log.
        pass

    def cookie(self, token, logout=False):
        secure = '; Secure' if self.environ.get('wsgi.url_scheme') == 'https' else ''
        return f'session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={0 if logout else 31536000}{secure}'


class Application:
    def __init__(self, handler, allowed_hosts):
        self.handler = handler
        self.allowed_hosts = allowed_hosts or {'localhost', '127.0.0.1', '::1'}

    def __call__(self, environ, start_response):
        request = self.handler(environ)
        try:
            if not valid_host(environ.get('HTTP_HOST', ''), self.allowed_hosts):
                request.reply(400, {'error':'Host rejected'})
            elif request.command in ('GET', 'HEAD'):
                request.do_GET()
            elif request.command == 'POST':
                content_type = environ.get('CONTENT_TYPE', '').split(';')[0].strip().lower()
                if content_type and content_type != 'application/json':
                    request.reply(415, {'error':'Use application/json'})
                else:request.do_POST()
            else:
                request.send_header('Allow', 'GET, HEAD, POST')
                request.reply(405, {'error':'Method not allowed'})
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            if request.body is not None:request.body.close()
            request.body = None
            request.wfile = io.BytesIO()
            request.reply(500, {'error':'Connection closed'})
        except Exception:
            import logging
            logging.getLogger('hmi.web').exception('Request failed: %s %s', request.command, urlsplit(request.path).path)
            if request.body is not None:request.body.close()
            request.body = None
            request.wfile = io.BytesIO()
            request.response_headers = {}
            request.reply(500, {'error':'Server operation failed'})
        headers = request.response_headers
        headers.setdefault('X-Content-Type-Options', 'nosniff')
        headers.setdefault('Referrer-Policy', 'same-origin')
        headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
        headers.setdefault('Cache-Control', 'no-store')
        if headers.get('Content-Type', '').startswith('text/html'):
            headers.setdefault('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'")
        body = request.body if request.body is not None else [request.wfile.getvalue()]
        if request.body is None:headers.setdefault('Content-Length', str(len(request.wfile.getvalue())))
        if request.command == 'HEAD':
            if request.body is not None:request.body.close()
            body = []
        request.log_request(request.status)
        try:
            start_response(f'{request.status} {HTTPStatus(request.status).phrase}', list(headers.items()))
        except BaseException:
            if request.body is not None:request.body.close()
            raise
        return body
