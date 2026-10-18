import threading
import unittest
from hmi.polling import PollingManager, page_tags


class PollDriver:
    def __init__(self): self.batches = []
    def read_many(self, addresses):
        self.batches.append(addresses)
        return {a: {'value': 1, 'quality': 'good'} for a in addresses}


class PollingTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.poll = PollingManager(clock=lambda: self.now)
        self.driver = PollDriver()
        self.sources = [{'id': 'plc', 'kind': 'pycomm3', 'settings': {'live': 0.5, 'background': 20}}]
        self.tags = [{'id': 'a', 'source': 'plc', 'address': 'A'}, {'id': 'b', 'source': 'plc', 'address': 'B'}]
        self.poll.configure(self.sources, self.tags, {'plc': self.driver})

    def test_cov_sample_timestamp_is_not_refreshed_by_cached_reads(self):
        class CachedDriver:
            def read_many(self, addresses):
                return {address: {'value': 7, 'quality': 'good', 'timestamp': 1234.5} for address in addresses}
        self.poll.configure(self.sources, self.tags, {'plc': CachedDriver()})
        self.poll.poll_due(False)
        self.assertEqual(self.poll.samples()['a']['timestamp'], 1234.5)

    def test_driver_tag_configuration_tracks_removal(self):
        class ConfiguredDriver(PollDriver):
            def configure_tags(self, addresses): self.addresses = addresses
        driver = ConfiguredDriver()
        self.poll.configure(self.sources, self.tags, {'plc': driver})
        self.assertEqual(driver.addresses, ['A', 'B'])
        self.poll.configure(self.sources, self.tags[:1], {'plc': driver})
        self.assertEqual(driver.addresses, ['A'])

    def test_diagnostics_count_batches_without_reading(self):
        self.poll.interest('viewer', ['a'])
        self.poll.poll_due(False)
        stats = self.poll.diagnostics()
        self.assertEqual(stats['clients'], 1)
        self.assertEqual(stats['sources']['plc']['batches'], 1)
        self.assertEqual(stats['sources']['plc']['tag_reads'], 2)
        self.assertEqual(stats['sources']['plc']['live_tags'], 1)
        self.assertEqual(stats['sources']['plc']['failed_batches'], 0)
        self.assertEqual(len(self.driver.batches), 1)
        self.now = 9
        self.assertEqual(self.poll.diagnostics()['clients'], 0)

    def test_updates_notify_event_worker(self):
        self.poll.changed.clear()
        self.poll.poll_due(False)
        self.assertTrue(self.poll.changed.is_set())
        self.poll.changed.clear()
        self.poll.update('a', 2)
        self.assertTrue(self.poll.changed.is_set())

    def test_live_background_shared_clients_and_expiry(self):
        self.poll.poll_due(False)
        self.assertEqual(self.driver.batches, [['A', 'B']])
        self.now = 0.5;self.poll.poll_due(False)
        self.assertEqual(len(self.driver.batches), 1)
        self.poll.interest('one', ['a']);self.poll.interest('two', ['a'])
        self.poll.poll_due(False)
        self.assertEqual(self.driver.batches[-1], ['A'])
        self.poll.interest('one', [])
        self.now = 1;self.poll.poll_due(False)
        self.assertEqual(self.driver.batches[-1], ['A'])
        count = len(self.driver.batches)
        self.now = 10;self.poll.poll_due(False)
        self.assertEqual(len(self.driver.batches), count)
        self.now = 20;self.poll.poll_due(False)
        self.assertEqual(self.driver.batches[-1], ['B'])
        self.now = 21;self.poll.poll_due(False)
        self.assertEqual(self.driver.batches[-1], ['A'])

    def test_failed_source_does_not_block_other_sources(self):
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        class Slow(PollDriver):
            def read_many(self, addresses):
                entered.set();release.wait(2);raise OSError('Disconnected')
        class Fast(PollDriver):
            def read_many(self, addresses):
                result = super().read_many(addresses);finished.set();return result
        sources = self.sources + [{'id': 'second', 'kind': 'pycomm3', 'settings': {'live': 0.5, 'background': 20}}]
        tags = self.tags + [{'id': 'c', 'source': 'second', 'address': 'C'}]
        fast = Fast()
        self.poll.configure(sources, tags, {'plc': Slow(), 'second': fast})
        try:
            self.poll.poll_due()
            self.assertTrue(entered.wait(1))
            self.assertTrue(finished.wait(1))
            self.assertEqual(fast.batches, [['C']])
        finally:
            release.set()

    def test_all_page_references_promoted(self):
        page = {'controls': [{'binding': {'tag': 'display'}, 'actions': [{'tag': 'target', 'action': 'set'}],
                'events': [{'tag': 'trigger', 'operand': {'kind': 'tag', 'tag': 'lower'},
                            'end_operand': {'kind': 'tag', 'tag': 'upper'}}]}]}
        self.assertEqual(page_tags(page), {'display', 'target', 'trigger', 'lower', 'upper'})

    def test_inflight_read_does_not_overwrite_newer_write(self):
        manager = self.poll
        class DuringWrite(PollDriver):
            def read_many(self, addresses):
                manager.update('a', 99)
                return super().read_many(addresses)
        self.poll.configure(self.sources, self.tags, {'plc': DuringWrite()})
        self.poll.poll_due(False)
        self.assertEqual(self.poll.samples()['a']['value'], 99)


class ConnectionStatusTests(unittest.TestCase):
    def test_status_never_sent_to_device_and_only_published_on_change(self):
        class Driver(PollDriver):
            connected=True
            def status(self):return {'quality':'good' if self.connected else 'bad'}
            def configure_tags(self,addresses):self.addresses=addresses
        driver=Driver();poll=PollingManager()
        tag={'id':'connected','source':'plc','address':'$status/connected','connection_status':True}
        poll.configure([{'id':'plc','kind':'pycomm3','settings':{'live':.5,'background':20}}],[tag],{'plc':driver})
        self.assertEqual(driver.addresses,[])
        initial=poll.samples()['connected']
        poll.poll_due(False)
        self.assertEqual(driver.batches,[])
        self.assertEqual(poll.samples()['connected'],initial)
        driver.connected=False;poll.refresh_connections(force=True)
        self.assertIs(poll.samples()['connected']['value'],False)
        self.assertEqual(poll.samples()['connected']['quality'],'good')

    def test_slow_status_does_not_block_other_source_polling(self):
        release=threading.Event();entered=threading.Event();read=threading.Event()
        class SlowDriver(PollDriver):
            block=False
            def status(self):
                if self.block:entered.set();release.wait(2)
                return {'quality':'good'}
        class FastDriver(PollDriver):
            def read_many(self,addresses):read.set();return super().read_many(addresses)
        slow=SlowDriver();fast=FastDriver();clock=[0];poll=PollingManager(clock=lambda:clock[0])
        sources=[{'id':name,'kind':'pycomm3','settings':{'background':20}} for name in ['slow','fast']]
        tags=[{'id':'connected','source':'slow','address':'$status/connected','connection_status':True},{'id':'value','source':'fast','address':'A'}]
        poll.configure(sources,tags,{'slow':slow,'fast':fast});slow.block=True;clock[0]=1
        try:
            poll.poll_due()
            self.assertTrue(entered.wait(1));self.assertTrue(read.wait(1))
        finally:release.set()
