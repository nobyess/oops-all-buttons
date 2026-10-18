"""Shared cached polling; no PLC I/O runs under the configuration lock."""
import math
import threading
import time
from .inline_text import inline_ids


def page_tags(page):
    result = set()
    for control in [page, *page.get('controls', []), *page.get('groups', [])]:
        result.add(control.get('binding', {}).get('tag'))
        result.update(inline_ids(control))
        for action in control.get('actions', []):
            if action.get('action') not in ('navigate', 'popup'):
                result.add(action.get('tag'))
        for event in control.get('events', []):
            result.update((event.get('tag'), event.get('target')))
            for key in ('operand', 'end_operand'):
                operand = event.get(key, {})
                if operand.get('kind') == 'tag':
                    result.add(operand.get('tag'))
    return result - {None, ''}


class PollingManager:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.lock = threading.RLock()
        self.sources, self.tags, self.drivers = {}, {}, {}
        self.cache, self.attempts, self.leases = {}, {}, {}
        self.versions = {}
        self.statistics = {}
        self.busy = set()
        self.on_samples = None
        self.last_status_check = -math.inf
        self.status_busy = False
        self.permanent_interest = set()
        self.error_log = None
        self.changed = threading.Event()
        self.changed.set()

    def configure(self, sources, tags, drivers):
        with self.lock:
            changed = {t['id'] for t in tags if self.tags.get(t['id'], {}).get('address') != t['address']
                       or self.drivers.get(t['source']) is not drivers.get(t['source'])}
            for name in changed:
                self.cache.pop(name, None)
                self.attempts.pop(name, None)
                self.versions[name] = self.versions.get(name, 0) + 1
            self.sources = {s['id']: s for s in sources if s['kind'] != 'memory'}
            self.tags = {t['id']: t for t in tags if t['source'] in self.sources}
            self.drivers = dict(drivers)
            self.cache = {k: v for k, v in self.cache.items() if k in self.tags}
            self.attempts = {k: v for k, v in self.attempts.items() if k in self.tags}
            self.versions = {k: v for k, v in self.versions.items() if k in self.tags}

        for source, driver in drivers.items():
            configure = getattr(driver, 'configure_tags', None)
            if callable(configure):
                configure([tag['address'] for tag in tags if tag['source'] == source and not tag.get('connection_status')])
        self.refresh_connections(force=True)
        self.changed.set()

    def refresh_connections(self, force=False, source=None):
        # Driver status is cached health, never a probe or device read.
        with self.lock:
            now=self.clock()
            if source is None:
                if not force and now-self.last_status_check < .5:return
                self.last_status_check=now
            tags=[tag for tag in self.tags.values() if tag.get("connection_status") and (source is None or tag["source"]==source)]
            drivers=dict(self.drivers)
        changed=False
        for tag in tags:
            driver=drivers.get(tag["source"])
            try:connected=bool(driver and driver.status().get("quality")=="good")
            except Exception:connected=False
            with self.lock:
                if self.tags.get(tag["id"])!=tag or self.drivers.get(tag["source"]) is not driver:continue
                previous=self.cache.get(tag["id"])
                if previous is None or previous.get("value") != connected:
                    self.cache[tag["id"]]={"value":connected,"quality":"good","timestamp":time.time(),"error":""}
                    changed=True
        if changed:self.changed.set()
        return changed

    def interest(self, client, tags):
        with self.lock:
            self.leases = {k: v for k, v in self.leases.items() if v[0] > self.clock()}
            if tags:
                self.leases[client] = (self.clock() + 8, set(tags))
            else:
                self.leases.pop(client, None)

    def samples(self, tag_ids=None):
        with self.lock:
            return {name: dict(self.cache.get(name, {'value': None, 'quality': 'bad',
                    'timestamp': None, 'error': 'Waiting for first poll'})) for name in self.tags if tag_ids is None or name in tag_ids}

    def update(self, tag, value):
        with self.lock:
            self.versions[tag] = self.versions.get(tag, 0) + 1
            self.cache[tag] = {'value': value, 'quality': 'good', 'timestamp': time.time(), 'error': ''}

        self.changed.set()

    def acknowledge_write(self, tag):
        # Do not publish commands as feedback; discard reads started before this write.
        with self.lock:
            self.versions[tag] = self.versions.get(tag, 0) + 1

    @staticmethod
    def valid_value(value):
        if isinstance(value, float):
            return math.isfinite(value)
        if isinstance(value, dict):
            return all(PollingManager.valid_value(v) for v in value.values())
        if isinstance(value, list):
            return all(PollingManager.valid_value(v) for v in value)
        return value is None or isinstance(value, (str, int, bool))

    def _refresh_status(self):
        try:
            if self.refresh_connections() and self.on_samples:self.on_samples()
        finally:
            with self.lock:self.status_busy=False

    def poll_due(self, asynchronous=True):
        # Some drivers guard health with their I/O lock. Do not stall other
        # sources' scheduling while waiting for that driver's cached status.
        if asynchronous:
            with self.lock:
                refresh=not self.status_busy and self.clock()-self.last_status_check >= .5
                if refresh:self.status_busy=True
            if refresh:threading.Thread(target=self._refresh_status,daemon=True).start()
        elif self.refresh_connections() and self.on_samples:self.on_samples()
        with self.lock:
            now = self.clock()
            self.leases = {k: v for k, v in self.leases.items() if v[0] > now}
            live = set(self.permanent_interest).union(*(v[1] for v in self.leases.values()))
            jobs = {}
            for name, tag in self.tags.items():
                if tag.get("connection_status"):continue
                source = self.sources[tag['source']]
                settings = source['settings']
                interval = settings.get('live', 0.5) if name in live else settings.get('background', 20)
                if tag['source'] not in self.busy and now - self.attempts.get(name, -math.inf) >= interval:
                    jobs.setdefault(tag['source'], []).append(tag)
            for source, tags in jobs.items():
                self.busy.add(source)
                for tag in tags:
                    self.attempts[tag['id']] = now
        for source, tags in jobs.items():
            if asynchronous:
                threading.Thread(target=self._poll, args=(source, tags), daemon=True).start()
            else:
                self._poll(source, tags)

    def _poll(self, source, tags):
        started = time.monotonic()
        with self.lock:
            driver = self.drivers.get(source)
            versions = {t['id']: self.versions.get(t['id'], 0) for t in tags}
        try:
            if driver is None:
                raise ValueError('Source unavailable')
            addresses = list(dict.fromkeys(t['address'] for t in tags))
            samples = driver.read_many(addresses)
        except Exception as error:
            samples = {t['address']: {'value': None, 'quality': 'bad', 'error': str(error)} for t in tags}
        with self.lock:
            for tag in tags:
                if tag['id'] not in self.tags or self.drivers.get(source) is not driver:
                    continue
                if self.versions.get(tag['id'], 0) != versions[tag['id']]:
                    continue  # A later acknowledged write has fresher data.
                sample = dict(samples.get(tag['address'], {'value': None, 'quality': 'bad', 'error': 'No PLC response'}))
                if not self.valid_value(sample.get('value')):
                    sample = {'value': None, 'quality': 'bad', 'error': 'Invalid PLC value'}
                sample.setdefault('timestamp', time.time())
                self.cache[tag['id']] = sample
            stats = self.statistics.setdefault(source, {'batches': 0, 'failed_batches': 0, 'tag_reads': 0})
            stats['batches'] += 1
            stats['failed_batches'] += int(any(samples.get(t['address'], {}).get('quality') != 'good' for t in tags))
            stats['tag_reads'] += len(tags)
            stats['last_duration_ms'] = round((time.monotonic() - started) * 1000, 2)
            stats['last_poll'] = time.time()
            self.busy.discard(source)
        if self.error_log is not None:
            # One occurrence per distinct failure in this batch, not per tag.
            failures = {str(samples.get(t['address'], {}).get('error') or 'Read failed') for t in tags if samples.get(t['address'], {}).get('quality') != 'good'}
            for message in failures:
                self.error_log.record('Polling: '+self.sources.get(source, {}).get('name',source), message)
        self.refresh_connections(force=True,source=source)
        self.changed.set()
        if self.on_samples:
            self.on_samples()

    def diagnostics(self):
        with self.lock:
            now = self.clock()
            leases = [v for v in self.leases.values() if v[0] > now]
            live = set(self.permanent_interest).union(*(v[1] for v in leases))
            return {'clients': len(leases), 'sources': {
                source: {**self.statistics.get(source, {}), 'busy': source in self.busy,
                         'live_tags': sum(t['source'] == source and name in live for name, t in self.tags.items()),
                         'cached_tags': sum(t['source'] == source and name in self.cache for name, t in self.tags.items()),
                         'bad_tags': sum(t['source'] == source and self.cache.get(name, {}).get('quality') == 'bad' for name, t in self.tags.items())}
                for source in self.sources}}

    def run(self, stopped):
        while not stopped.wait(0.05):
            self.poll_due()
