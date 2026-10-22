import contextlib
import io
import threading
import unittest
from run import RequestLog, make_app
from wsgiref.util import setup_testing_defaults

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
        app = make_app(None, log)
        output=io.StringIO()
        with contextlib.redirect_stderr(output):
            for path in ['/app.js', '/controls.js']:
                env={};setup_testing_defaults(env)
                env.update(PATH_INFO=path, HTTP_HOST='localhost')
                response=app(env, lambda status, headers:None)
                list(response)
        self.assertEqual(log.snapshot()['total'],2)
        self.assertEqual(output.getvalue(),'')
