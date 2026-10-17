import contextlib
import io
import threading
import unittest
from run import RequestLog, make_handler

class RequestLoggingTests(unittest.TestCase):
    def test_concurrent_request_and_error_counts(self):
        log = RequestLog()
        def requests():
            for _ in range(100):
                log.record('POST', '/api/polling/interest', 200)
        workers = [threading.Thread(target=requests) for _ in range(4)]
        for w in workers: w.start()
        for w in workers: w.join()
        log.record('POST', '/api/polling/interest', 401)
        log.record('GET', '/api/sources?test=1', 500)
        stats=log.snapshot()
        self.assertEqual(stats['total'],402)
        self.assertEqual(stats['errors'],2)

    def test_access_statistics_do_not_print(self):
        log = RequestLog()
        handler = make_handler(None, log)
        request = object.__new__(handler)
        output=io.StringIO()
        with contextlib.redirect_stderr(output):
            for method, path in [('POST', '/api/values/batch'), ('GET', '/app.js')]:
                request.command, request.path = method, path
                handler.log_request(request, 200)
        self.assertEqual(log.snapshot()['total'],2)
        self.assertEqual(output.getvalue(),'')
