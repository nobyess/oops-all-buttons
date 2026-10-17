"""Bounded, thread-safe error history for the current server run."""
from collections import OrderedDict
import threading
import time

class ErrorLog:
    def __init__(self, limit=200):
        self.limit = limit
        self.lock = threading.Lock()
        self.entries = OrderedDict()

    def record(self, origin, message):
        origin, message = str(origin)[:300], str(message)[:2000]
        key = (origin, message)
        now = time.time()
        with self.lock:
            entry = self.entries.pop(key, None)
            if entry is None:
                entry = {'origin': origin, 'message': message, 'first': now, 'count': 0}
            entry.update(last=now, count=entry['count'] + 1)
            self.entries[key] = entry
            while len(self.entries) > self.limit:
                self.entries.popitem(last=False)

    def clear(self):
        with self.lock:
            self.entries.clear()

    def snapshot(self):
        with self.lock:
            return [dict(entry) for entry in reversed(self.entries.values())]
