import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from hmi.bacnet import BACnetDriver, bacnet_settings, parse_address, scalar
from hmi.bacnet_cov import COVManager
from test_bacnet import FakeBAC0, SETTINGS

A = '1443213/2:200/presentValue'
B = '1443213/2:201/presentValue'

class Context:
    def __init__(self, reject=False):
        self.queue = asyncio.Queue()
        self.reject = reject
        self.exited = False
        self.refresh_subscription_task = None
    async def __aenter__(self):
        if self.reject: raise ValueError('COV unsupported')
        return self
    async def __aexit__(self, *args): self.exited = True
    async def get_value(self): return await self.queue.get()

class COVTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.now = 0
        async def device(client, identity): return {'address': '192.0.2.10'}
        self.driver = SimpleNamespace(settings=bacnet_settings({**SETTINGS, 'use_cov': True}), _device=device)
        self.manager = COVManager(self.driver, parse_address, scalar, clock=lambda:self.now)
        self.contexts = []
        def factory(*args):
            context = Context();self.contexts.append(context);return context
        self.patch = patch('hmi.bacnet_cov.cov_context', side_effect=factory)
        self.patch.start()
    async def asyncTearDown(self):
        await self.manager.close();self.patch.stop()
    async def start(self, addresses=(A,)):
        await self.manager.ensure(None, addresses)
        for _ in range(8): await asyncio.sleep(0)
    def verify(self, value=1):
        cached, needed, serial = self.manager.split([A])
        samples = {A: {'quality':'good', 'value':value, 'error':''}}
        self.manager.remember(samples, serial)
        return samples
    async def test_initial_read_cache_notifications_and_periodic_verification(self):
        await self.start()
        self.assertEqual(self.manager.split([A])[1], [A])
        self.verify()
        self.assertEqual(self.manager.split([A])[1], [])
        await self.contexts[0].queue.put(('presentValue', 8))
        for _ in range(8): await asyncio.sleep(0)
        cached = self.manager.split([A])[0][A]
        self.assertEqual(cached['value'],8);self.assertIn('timestamp',cached)
        self.now = 31
        self.assertEqual(self.manager.split([A])[1], [A], 'Notifications do not postpone verification reads')
        self.assertEqual(self.manager.diagnostics()['notifications'], 1)
    async def test_rejection_falls_back_without_retry_storm(self):
        await self.manager.close()
        self.manager = COVManager(self.driver, parse_address, scalar, clock=lambda:self.now)
        with patch('hmi.bacnet_cov.cov_context', side_effect=lambda *args:Context(reject=True)) as factory:
            await self.start();await self.start()
            self.verify()
            self.assertEqual(self.manager.split([A])[1], [A])
            self.assertEqual(factory.call_count,1)
            self.assertIn('unsupported',self.manager.diagnostics()['last_error'])
            self.now=61;await self.start();self.assertEqual(factory.call_count,2)
    async def test_property_filter_configure_removal_and_close(self):
        self.manager.configure([A])
        await self.start([A,B,'1443213/2:200/units'])
        self.assertEqual(len(self.contexts),1)
        self.manager.configure([])
        for _ in range(8): await asyncio.sleep(0)
        self.assertTrue(self.contexts[0].exited)
        self.assertEqual(self.manager.entries,{})
    async def test_new_notification_wins_over_inflight_poll_and_errors_force_fallback(self):
        await self.start()
        _,_,versions=self.manager.split([A])
        await self.contexts[0].queue.put(('presentValue', 9))
        for _ in range(8): await asyncio.sleep(0)
        samples={A:{'quality':'good','value':1}}
        self.manager.remember(samples,versions)
        self.assertEqual(samples[A]['value'],9)
        self.manager.remember({A:{'quality':'bad','value':None,'error':'offline'}},versions)
        self.assertEqual(self.manager.split([A])[1],[A])
        for _ in range(8): await asyncio.sleep(0)
        self.assertTrue(self.contexts[0].exited)
    async def test_renewal_failure_stops_trusting_cov(self):
        await self.start();self.verify()
        future=asyncio.get_running_loop().create_future();future.set_exception(ValueError('renewal rejected'))
        self.contexts[0].refresh_subscription_task=future
        await self.contexts[0].queue.put(('presentValue',2))
        for _ in range(12): await asyncio.sleep(0)
        self.assertEqual(self.manager.split([A])[1],[A])
        self.assertIn('renewal rejected',self.manager.diagnostics()['last_error'])

class COVDriverTests(unittest.TestCase):
    def test_settings(self):
        self.assertFalse(bacnet_settings(SETTINGS)['use_cov'])
        for extra in [{'use_cov':'yes'},{'cov_confirmed':1},{'cov_lifetime':0},{'cov_verify':0},{'cov_lifetime':30.5}]:
            with self.assertRaises(ValueError):bacnet_settings({**SETTINGS,**extra})
    def test_driver_cache_preserves_direct_reads_and_cleanup(self):
        contexts=[]
        def factory(*args):
            context=Context();contexts.append(context);return context
        with patch('hmi.bacnet_cov.cov_context',side_effect=factory):
            driver=BACnetDriver({**SETTINGS,'use_cov':True},factory=FakeBAC0)
            try:
                driver.configure_tags([A])
                driver.read_many([A])
                async def settle(client):
                    for _ in range(8):await asyncio.sleep(0)
                driver._call(settle)
                driver.read_many([A])
                client=FakeBAC0.instances[-1];before=len(client.reads)
                driver.read_many([A]);self.assertEqual(len(client.reads),before)
                client.value=55
                self.assertEqual(driver.read(A),55,'Read/modify/write always reads the actual device')
                async def notify(client):
                    await contexts[0].queue.put(('presentValue',7))
                    for _ in range(8):await asyncio.sleep(0)
                driver._call(notify)
                self.assertEqual(driver.read_many([A])[A]['value'],7)
                driver.write(A,3)
                self.assertEqual(driver.read_many([A])[A]['value'],3)
                self.assertEqual(driver.status()['cov']['active'],1)
            finally:driver.close()
            self.assertTrue(contexts[0].exited)
