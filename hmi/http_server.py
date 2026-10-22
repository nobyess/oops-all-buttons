"""One Waitress process, bounded workers, and explicit tray/restart lifecycle."""
import ipaddress
import os
import socket
import threading
import time
from waitress import create_server, wasyncore
from waitress.task import ThreadedTaskDispatcher


class HTTPServer:
    def __init__(self, address, application, trusted_proxy=None, **overrides):
        self.stopped = threading.Event()
        self.map = {}
        self.dispatcher = ThreadedTaskDispatcher()
        options = dict(host=address[0], port=address[1], threads=8, backlog=128,
                       connection_limit=100, channel_timeout=60, cleanup_interval=5,
                       max_request_header_size=16384, max_request_body_size=90_000_000,
                       inbuf_overflow=524288, outbuf_overflow=1048576,
                       expose_tracebacks=False, clear_untrusted_proxy_headers=True,
                       ident='OopsAllButtons')
        if trusted_proxy:
            ipaddress.ip_address(trusted_proxy)
            options.update(trusted_proxy=trusted_proxy, trusted_proxy_count=1,
                           trusted_proxy_headers={'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'})
        options.update(overrides)
        bound = None
        try:
            if os.name == 'nt':
                # Windows SO_REUSEADDR can allow a second server on the same port.
                # Bind exclusively before handing the socket to Waitress.
                family, kind, protocol, _, target = socket.getaddrinfo(
                    address[0] or None, address[1], type=socket.SOCK_STREAM,
                    flags=socket.AI_PASSIVE)[0]
                bound = socket.socket(family, kind, protocol)
                bound.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                if family == socket.AF_INET6:bound.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
                bound.bind(target)
                options.pop('host');options.pop('port')
                options['sockets'] = [bound]
            self.dispatcher.set_thread_count(options['threads'])
            self.server = create_server(application, map=self.map, _dispatcher=self.dispatcher, **options)
        except BaseException:
            self.dispatcher.shutdown()
            wasyncore.close_all(self.map)
            if bound is not None:bound.close()
            raise

    def serve_forever(self):
        while self.map and not self.stopped.is_set():
            wasyncore.loop(timeout=0.2, count=1, map=self.map)

    def shutdown(self):
        # Called by the tray thread. Socket map mutation stays on the I/O thread.
        self.stopped.set()

    def server_close(self):
        # Keep I/O moving while active workers finish, so streaming cannot deadlock.
        finished = threading.Event()
        def drain():
            try:
                self.dispatcher.shutdown(timeout=30)
            finally:finished.set()
        worker = threading.Thread(target=drain, name='http-shutdown', daemon=True)
        worker.start()
        for channel in list(self.map.values()):
            if getattr(channel, 'accepting', False):
                channel.accepting = False
                channel.del_channel()
                channel.socket.close()
        deadline = time.monotonic() + 30
        while not finished.is_set() or (time.monotonic() < deadline and any(
                getattr(channel, 'total_outbufs_len', 0) for channel in self.map.values())):
            wasyncore.loop(timeout=0.1, count=1, map=self.map)
        worker.join()
        wasyncore.close_all(self.map)
        # Disconnect slow clients after the grace period, then wait for any device
        # operation to release its service state before drivers are closed.
        with self.dispatcher.lock:
            while self.dispatcher.threads:self.dispatcher.thread_exit_cv.wait(0.1)
