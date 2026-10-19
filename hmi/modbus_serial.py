"""Process-wide RTU bus ownership, FIFO transactions and per-unit recovery backoff."""
from collections import deque
import os
import re
import threading
import time

_registry = {}
_registry_lock = threading.Lock()


def port_key(port):
    value = str(port).strip()
    match = re.fullmatch(r'(?:\\\\\.\\)?COM([0-9]+)', value, re.I)
    return 'COM' + str(int(match[1])) if match else os.path.normcase(os.path.realpath(value))


def serial_ports():
    try:
        from serial.tools.list_ports import comports
    except ImportError:
        return []
    return [{'port': item.device, 'description': item.description} for item in sorted(comports(), key=lambda item:item.device)]


class SerialBus:
    def __init__(self, settings, factory, clock):
        self.signature = tuple(settings[key] for key in ('baudrate','parity','stopbits','timeout','handle_local_echo'))
        self.clock = clock
        self.condition = threading.Condition()
        self.queue = deque()
        self.active = False
        self.closed = False
        self.references = 0
        self.failures = {}
        self.requests = self.timeouts = 0
        self.last_duration_ms = 0
        self.client = factory(port=settings['serial_port'], baudrate=settings['baudrate'], bytesize=8,
                              parity=settings['parity'], stopbits=settings['stopbits'], timeout=settings['timeout'],
                              handle_local_echo=settings['handle_local_echo'], retries=0)

    def _check_unit(self, unit):
        if self.closed:
            raise ValueError('Serial bus is closed')
        failure = self.failures.get(unit)
        if failure and failure['until'] > self.clock():
            raise ValueError(f"Unit {unit} offline; waiting before retry: {failure['error']}")

    def execute(self, unit, retry_delay, operation, device_error):
        ticket = object()
        with self.condition:
            self._check_unit(unit)
            self.queue.append(ticket)
            try:
                while self.active or self.queue[0] is not ticket:
                    self.condition.wait()
                self._check_unit(unit)  # Another source for this unit may have failed while queued.
                self.active = True
            finally:
                self.queue.remove(ticket)
                self.condition.notify_all()
        started = self.clock()
        try:
            result = operation()
        except device_error:
            # A protocol exception proves the device replied; do not take it offline.
            with self.condition:self.failures.pop(unit, None)
            raise
        except Exception as error:
            if unit is not None:
                with self.condition:
                    streak = self.failures.get(unit, {}).get('streak', 0) + 1
                    delay = min(max(60, retry_delay), retry_delay * 2 ** min(streak - 1, 10))
                    self.failures[unit] = {'streak': streak, 'until': self.clock() + delay, 'error': str(error)}
                    self.timeouts += 1
            # Clear stale frames before another device uses the bus. Never close it outside our turn.
            try:self.client.close()
            except Exception:pass
            raise
        else:
            with self.condition:self.failures.pop(unit, None)
            return result
        finally:
            with self.condition:
                self.requests += 1
                self.last_duration_ms = round((self.clock()-started)*1000, 2)
                self.active = False
                self.condition.notify_all()

    def diagnostics(self, unit):
        with self.condition:
            failure = self.failures.get(unit, {})
            return {'serial_sources': self.references, 'bus_queued': len(self.queue), 'bus_busy': self.active,
                    'bus_requests': self.requests, 'bus_failures': self.timeouts,
                    'bus_last_duration_ms': self.last_duration_ms,
                    'retry_after_seconds': round(max(0, failure.get('until',0)-self.clock()), 1)}


def acquire_bus(settings, factory, clock=time.monotonic, replacing=None):
    key = port_key(settings['serial_port'])
    signature = tuple(settings[field] for field in ('baudrate','parity','stopbits','timeout','handle_local_echo'))
    with _registry_lock:
        bus = _registry.get(key)
        if bus and bus.signature != signature:
            if bus is not replacing or bus.references != 1:
                raise ValueError('Sources sharing a serial port must use the same baud rate, parity, stop bits, timeout and local echo settings. Remove other sources on this port before changing bus settings.')
            replacement = SerialBus(settings, factory, clock)
            with bus.condition:
                while bus.active:bus.condition.wait()
                bus.closed = True
                bus.client.close()
                bus.condition.notify_all()
            bus = replacement
            _registry[key] = bus
        if bus is None:
            bus = SerialBus(settings, factory, clock)
            _registry[key] = bus
        bus.references += 1
        return bus


def release_bus(bus):
    with _registry_lock:
        bus.references -= 1
        if bus.references:
            return
        with bus.condition:
            if not bus.closed:
                bus.closed = True
                bus.client.close()
            bus.condition.notify_all()
        for key, value in list(_registry.items()):
            if value is bus:del _registry[key]
