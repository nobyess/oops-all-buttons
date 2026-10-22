"""Legacy wire assertions exercise the WSGI app without a listening socket."""
import io
from email.parser import BytesHeaderParser
from urllib.parse import urlsplit, unquote
from wsgiref.util import setup_testing_defaults
import run


def make_handler(service, request_log=None):
    app = run.make_app(service, request_log, root=run.ROOT)
    class Handler:
        def __init__(self, socket, address, server):
            stream = socket.makefile('rb')
            method, target, protocol = stream.readline().decode().strip().split(' ', 2)
            header_bytes = b''
            while True:
                line = stream.readline()
                if line in (b'\r\n', b'\n', b''):break
                header_bytes += line
            headers = BytesHeaderParser().parsebytes(header_bytes)
            env = {};setup_testing_defaults(env)
            parsed = urlsplit(target)
            env.update(REQUEST_METHOD=method, PATH_INFO=unquote(parsed.path), QUERY_STRING=parsed.query,
                       REMOTE_ADDR=address[0], SERVER_PROTOCOL=protocol, HTTP_HOST='localhost')
            env['wsgi.input']=stream
            for name, value in headers.items():
                key=name.upper().replace('-', '_')
                env[key if key in ('CONTENT_TYPE','CONTENT_LENGTH') else 'HTTP_'+key]=value
            def start(status, response_headers):
                socket.sendall(('HTTP/1.0 '+status+'\r\n'+''.join(f'{k}: {v}\r\n' for k,v in response_headers)+'\r\n').encode())
            response=app(env,start)
            try:
                for chunk in response:socket.sendall(chunk)
            finally:
                if hasattr(response,'close'):response.close()
    return Handler
