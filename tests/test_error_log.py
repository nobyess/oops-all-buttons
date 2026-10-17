import unittest
from concurrent.futures import ThreadPoolExecutor
from hmi.error_log import ErrorLog
from hmi.polling import PollingManager

class ErrorLogTests(unittest.TestCase):
    def test_grouping_bounding_order_and_snapshot(self):
        log=ErrorLog(limit=2)
        log.record('HTTP 401 GET /api/tags','Please sign in')
        log.record('Polling: PLC','Disconnected')
        log.record('HTTP 401 GET /api/tags','Please sign in')
        rows=log.snapshot()
        self.assertEqual(rows[0]['count'],2)
        self.assertLessEqual(rows[0]['first'],rows[0]['last'])
        rows[0]['count']=100
        self.assertEqual(log.snapshot()[0]['count'],2)
        log.record('New','Error')
        self.assertEqual(len(log.snapshot()),2)
        self.assertNotIn('Polling: PLC',[row['origin'] for row in log.snapshot()])

    def test_concurrent_repetitions(self):
        log=ErrorLog()
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda _:log.record('PLC','No reply'),range(1000)))
        self.assertEqual(log.snapshot()[0]['count'],1000)
        self.assertEqual(len(log.snapshot()),1)

    def test_poll_failures_group_once_per_batch(self):
        class Driver:
            def read_many(self, addresses): raise ValueError('No reply')
        poll=PollingManager();poll.error_log=ErrorLog()
        poll.configure([{'id':'plc','name':'Test PLC','kind':'pycomm3','settings':{}}],
            [{'id':str(i),'source':'plc','address':str(i)} for i in range(5)],{'plc':Driver()})
        poll.poll_due(False)
        rows=poll.error_log.snapshot()
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['origin'],'Polling: Test PLC')
        self.assertEqual(rows[0]['count'],1)
        self.assertEqual(rows[0]['message'],'No reply')

    def test_clear_starts_new_history(self):
        log=ErrorLog()
        log.record('PLC','No reply');log.record('PLC','No reply')
        log.clear()
        self.assertEqual(log.snapshot(),[])
        log.record('PLC','No reply')
        self.assertEqual(log.snapshot()[0]['count'],1)
