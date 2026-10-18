"""Optional object COV subscriptions on BAC0's underlying BACpypes application.

Notifications stay in a driver cache. The existing scheduler publishes that cache
at its normal intervals; verification reads bound failure-detection time.
"""
import asyncio
import threading
import time


def cov_context(client, address, kind, instance, confirmed, lifetime):
    from bacpypes3.pdu import Address
    from bacpypes3.primitivedata import ObjectIdentifier
    return client.this_application.app.change_of_value(
        Address(address), ObjectIdentifier((kind, instance)),
        issue_confirmed_notifications=confirmed, lifetime=lifetime)


class COVManager:
    def __init__(self, driver, parse, scalar, clock=time.monotonic):
        self.driver, self.parse, self.scalar, self.clock = driver, parse, scalar, clock
        self.lock = threading.RLock()
        self.entries = {}
        self.allowed = None
        self.stopped = False
        self.notifications = 0
        self.tasks = set()

    def key(self, address):
        device, kind, instance, prop = self.parse(address)
        return (device, kind, instance) if prop == 'presentValue' else None

    def configure(self, addresses):
        # Runs on the BACnet event loop, including task cancellation.
        self.allowed = {key for address in addresses if (key := self.key(address))}
        with self.lock:
            for key in list(self.entries):
                if key not in self.allowed:
                    entry = self.entries.pop(key)
                    if entry.get('task'): entry['task'].cancel()

    async def ensure(self, client, addresses):
        if self.stopped: return
        for address in addresses:
            key = self.key(address)
            if key is None or (self.allowed is not None and key not in self.allowed): continue
            with self.lock:
                entry = self.entries.setdefault(key, {'active': False, 'retry': 0, 'verified': None, 'serial': 0})
                task = entry.get('task')
                if task is not None and not task.done(): continue
                if self.clock() < entry['retry']: continue
                entry['task'] = asyncio.create_task(self.listen(client, key, entry))
                self.tasks.add(entry['task'])
                entry['task'].add_done_callback(self.tasks.discard)
        # Let new subscriptions start, without holding up reads for their ACKs.
        await asyncio.sleep(0)

    async def listen(self, client, key, entry):
        context = None
        entered = False
        try:
            device = await self.driver._device(client, key[0])
            settings = self.driver.settings
            context = cov_context(client, device['address'], key[1], key[2], settings['cov_confirmed'], settings['cov_lifetime'])
            await asyncio.wait_for(context.__aenter__(), settings['timeout'])
            entered = True
            with self.lock: entry['active'] = True; entry.pop('error', None)
            while not self.stopped:
                # BACpypes renews finite subscriptions. Observe renewal failures
                # so a dead renewal task cannot leave us trusting stale COV data.
                renewal = getattr(context, 'refresh_subscription_task', None)
                if renewal is not None and renewal.done():
                    if renewal.cancelled(): raise ValueError('COV renewal cancelled')
                    if renewal.exception() is not None: raise renewal.exception()
                try:
                    prop, value = await asyncio.wait_for(context.get_value(), 1)
                except asyncio.TimeoutError:
                    continue
                if str(getattr(prop, 'attr', prop)) not in ('presentValue', 'present-value', '85'): continue
                value = self.scalar(value, 'presentValue')
                with self.lock:
                    entry['sample'] = {'value': value, 'quality': 'good', 'error': '', 'timestamp': time.time()}
                    entry['serial'] += 1
                    self.notifications += 1
        except asyncio.CancelledError:
            pass
        except Exception as error:
            with self.lock: entry['error'] = str(error) or type(error).__name__
        finally:
            with self.lock:
                entry['active'] = False
                entry['retry'] = self.clock() + 60
            renewal = getattr(context, 'refresh_subscription_task', None)
            if renewal is not None and not renewal.done():
                renewal.cancel()
                await asyncio.gather(renewal, return_exceptions=True)
            if entered:
                try:
                    # A normal exit explicitly unsubscribes; lifetime still
                    # bounds the remote lease if the device is unreachable.
                    await asyncio.wait_for(context.__aexit__(None, None, None), self.driver.settings['timeout'])
                except Exception:
                    pass

    def split(self, addresses):
        cached, needed, versions = {}, [], {}
        with self.lock:
            for address in addresses:
                key = self.key(address)
                entry = self.entries.get(key, {})
                versions[address] = entry.get('serial', 0)
                verified = entry.get('verified')
                if (entry.get('active') and verified is not None
                        and self.clock() - verified < self.driver.settings['cov_verify']
                        and entry.get('sample', {}).get('quality') == 'good'):
                    cached[address] = dict(entry['sample'])
                else:
                    needed.append(address)
        return cached, needed, versions

    def remember(self, samples, versions):
        with self.lock:
            for address, sample in samples.items():
                entry = self.entries.get(self.key(address))
                if entry is None: continue
                if sample.get('quality') == 'good':
                    entry['verified'] = self.clock()
                    # A notification received during a verification read wins.
                    if entry['serial'] == versions.get(address, 0):
                        entry['sample'] = {**sample, 'timestamp': time.time()}
                    samples[address] = dict(entry['sample'])
                else:
                    entry['verified'] = None
                    entry['sample'] = dict(sample)
                    task = entry.get('task')
                    if task is not None and not task.done():
                        task.get_loop().call_soon_threadsafe(task.cancel)

    def invalidate(self, address):
        with self.lock:
            entry = self.entries.get(self.key(address))
            if entry: entry['verified'] = None

    def diagnostics(self):
        with self.lock:
            return {'enabled': self.driver.settings['use_cov'],
                    'active': sum(bool(entry.get('active')) for entry in self.entries.values()),
                    'polling': sum(not entry.get('active', False) for entry in self.entries.values()),
                    'notifications': self.notifications,
                    'last_error': next((entry['error'] for entry in reversed(list(self.entries.values())) if entry.get('error')), '')}

    async def close(self):
        self.stopped = True
        with self.lock:
            tasks = list(self.tasks)
        for task in tasks: task.cancel()
        if tasks: await asyncio.gather(*tasks, return_exceptions=True)
        with self.lock: self.entries.clear()
