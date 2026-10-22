"""Bounded authentication state and explicit host/proxy boundaries."""
import ipaddress
import secrets
import socket
import threading
import time
from collections import OrderedDict, deque
from contextlib import contextmanager
from http.cookies import SimpleCookie, CookieError
from urllib.parse import urlsplit
from hmi.session_settings import session_settings, session_valid


def authority(value):
    if not value or any(c.isspace() or ord(c)<32 for c in value) or any(c in value for c in '/\\@?#,'):
        raise ValueError('Invalid host')
    parsed = urlsplit('//' + value)
    host = parsed.hostname
    port = parsed.port
    if not host or (port is not None and not 1 <= port <= 65535):raise ValueError('Invalid host')
    # Reject unbracketed IPv6 and malformed domain names.
    if ':' in host:ipaddress.IPv6Address(host)
    elif any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-._' for c in host.lower()):raise ValueError('Invalid host')
    return host.lower().rstrip('.'), port


def valid_host(value, allowed):
    try:return authority(value)[0] in allowed
    except ValueError:return False


def same_origin(origin, environ):
    try:
        parsed = urlsplit(origin)
        if parsed.scheme not in ('http', 'https') or parsed.path or parsed.query or parsed.fragment:return False
        host, port = authority(parsed.netloc)
        expected_host, expected_port = authority(environ.get('HTTP_HOST', ''))
        scheme = environ.get('wsgi.url_scheme', 'http')
        return parsed.scheme == scheme and host == expected_host and (port or (443 if parsed.scheme=='https' else 80)) == (expected_port or (443 if scheme=='https' else 80))
    except ValueError:return False


def local_hosts(bind, extra=()):
    allowed = {'localhost', '127.0.0.1', '::1'}
    if bind not in ('', '0.0.0.0', '::'):
        allowed.add(authority('['+bind+']' if ':' in bind else bind)[0])
    else:
        from hmi.network import local_interfaces
        allowed.update(item['address'] for item in local_interfaces())
        for name in (socket.gethostname(), socket.getfqdn()):
            allowed.add(name.lower().rstrip('.'))
        try:allowed.update(info[4][0] for info in socket.getaddrinfo(socket.gethostname(), None))
        except OSError:pass
    for name in extra:
        host, port = authority(name)
        if port is not None:raise ValueError('--allowed-host takes a hostname without a port')
        allowed.add(host)
    return allowed


class Sessions:
    """Copies leave the lock; only explicit updates can mutate shared records."""
    def __init__(self, access, service, maximum=1024, per_user=20):
        self.access, self.service = access, service
        self.maximum, self.per_user = maximum, per_user
        self.records = OrderedDict()
        self.lock = threading.RLock()
        self.last_prune = 0

    def _user(self, record):
        user = self.access.current(record)
        if user is None or not session_valid(record, session_settings(user.get('session_settings', self.service.store.get('session_settings', {})))):return None
        return user

    def _prune(self):
        now = time.monotonic()
        if now-self.last_prune < 60:return
        self.last_prune = now
        for token, record in list(self.records.items()):
            if self._user(record) is None:self.records.pop(token, None)

    def add(self, token, user):
        with self.lock:
            self._prune()
            tokens = [key for key, value in self.records.items() if value['user_id']==user['id']]
            for key in tokens[:max(0, len(tokens)-self.per_user+1)]:self.records.pop(key, None)
            while len(self.records)>=self.maximum:self.records.popitem(last=False)
            self.records[token] = {'csrf':secrets.token_urlsafe(32), 'created':time.time(), 'activity':time.time(), 'user_id':user['id'], 'revision':user['revision']}

    def get_cookie(self, value):
        try:
            cookie = SimpleCookie();cookie.load(value)
            token = cookie['session'].value if 'session' in cookie else None
        except CookieError:return None
        with self.lock:
            self._prune()
            record = self.records.get(token)
            if not record:return None
            user = self._user(record)
            if user is None:
                self.records.pop(token, None)
                return None
            result = dict(record, _token=token, user=self.access.public(user))
            if record.get('kiosk_exited') and user['administrator']:result['user']['kiosk']=False
            return result

    def update(self, record, **changes):
        with self.lock:
            current = self.records.get(record['_token'])
            if current is not None:current.update(changes)

    def remove(self, token):
        with self.lock:self.records.pop(token, None)


class LoginThrottle:
    def __init__(self, per_ip=10, total=60, window=60, maximum=1024):
        self.per_ip, self.total, self.window, self.maximum = per_ip, total, window, maximum
        self.buckets = OrderedDict()
        self.global_attempts = deque()
        self.lock = threading.Lock()
        self.slots = threading.BoundedSemaphore(2)

    def attempt(self, address):
        now = time.monotonic()
        with self.lock:
            while self.global_attempts and self.global_attempts[0]<=now-self.window:self.global_attempts.popleft()
            bucket = self.buckets.pop(address, deque())
            while bucket and bucket[0]<=now-self.window:bucket.popleft()
            if len(bucket)>=self.per_ip or len(self.global_attempts)>=self.total:
                self.buckets[address]=bucket
                while len(self.buckets)>self.maximum:self.buckets.popitem(last=False)
                return max(1, int(self.window-(now-(bucket[0] if len(bucket)>=self.per_ip else self.global_attempts[0])))+1)
            bucket.append(now);self.global_attempts.append(now)
            self.buckets[address]=bucket
            while len(self.buckets)>self.maximum:self.buckets.popitem(last=False)
            return 0


class LoginBusy(Exception):
    pass


@contextmanager
def login_slot(throttle):
    if not throttle.slots.acquire(blocking=False):raise LoginBusy()
    try:yield
    finally:throttle.slots.release()
