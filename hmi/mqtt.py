"""Paho MQTT connection with a bounded cache of configured exact topics."""
import json
import math
import threading
import time
import uuid


def mqtt_settings(data):
    result = {key: str(data.get(key, '')).strip() for key in ('host', 'username', 'client_id')}
    result['password'] = str(data.get('password', ''))
    if not result['host']:
        raise ValueError('Broker host is required')
    for key, default, low, high in [('port', 1883, 1, 65535), ('qos', 0, 0, 2), ('keepalive', 60, 5, 3600), ('timeout', 5, .1, 60), ('live', .5, .1, 60), ('background', 20, .1, 60)]:
        value = float(data.get(key, default))
        if not math.isfinite(value) or not low <= value <= high or (key in ('port','qos','keepalive') and value != int(value)):
            raise ValueError('Invalid MQTT ' + key)
        result[key] = int(value) if key in ('port','qos','keepalive') else value
    for key in ('tls', 'retain'):
        result[key] = data.get(key, False) in (True, 'true', '1', 1)
    return result


def topic_name(address):
    address = str(address).strip()
    if not address or any(c in address for c in ('#', '+', chr(0))) or len(address.encode('utf-8')) > 65535:
        raise ValueError('Enter an exact MQTT topic without + or # wildcards')
    return address


def topic_filter(value):
    value = str(value).strip()
    if not value or len(value.encode('utf-8')) > 512 or chr(0) in value:
        raise ValueError('Enter a topic filter of up to 512 bytes')
    levels = value.split('/')
    if any(('+' in part and part != '+') or ('#' in part and (part != '#' or index != len(levels)-1)) for index, part in enumerate(levels)):
        raise ValueError('Use + for one whole level, or # as the final whole level')
    return value


def matches_filter(pattern, topic):
    if topic.startswith('$') and not pattern.startswith('$'):
        return False
    parts = topic.split('/')
    for index, level in enumerate(pattern.split('/')):
        if level == '#':
            return True
        if index >= len(parts) or (level != '+' and level != parts[index]):
            return False
    return len(parts) == len(pattern.split('/'))


class MQTTDriver:
    def __init__(self, settings, client_factory=None, discovery_filter=None):
        self.settings = mqtt_settings(settings)
        self.lock = threading.RLock()
        self.topics, self.cache = set(), {}
        self.discovery_filter = topic_filter(discovery_filter) if discovery_filter is not None else None
        self.discoveries = {}
        self.discovery_limit = 1000
        self.discovery_capped = False
        self.closed = False
        self.connected = False
        self.message = 'Connecting to broker'
        self.ready = threading.Event()
        self.received = self.published = 0
        if client_factory is None:
            try:
                import paho.mqtt.client as mqtt
            except ImportError:
                raise ValueError('Install Paho: python -m pip install -r requirements-mqtt.txt') from None
            client_factory = lambda identity: mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=identity)
        self.client_factory = client_factory
        self.client = client_factory(self.settings['client_id'] or 'hmi-' + uuid.uuid4().hex)
        self.client.on_connect = self._connect
        self.client.on_disconnect = self._disconnect
        self.client.on_connect_fail = self._connect_fail
        self.client.on_message = self._message
        if self.settings['username']:
            self.client.username_pw_set(self.settings['username'], self.settings['password'])
        if self.settings['tls']:
            self.client.tls_set()
        self.client.reconnect_delay_set(1, 30)
        self.client.connect_async(self.settings['host'], self.settings['port'], self.settings['keepalive'])
        self.client.loop_start()

    def _connect(self, client, userdata, flags, reason, properties):
        with self.lock:
            self.connected = reason == 0
            self.message = 'Connected' if self.connected else 'Broker rejected connection: ' + str(reason)
            if self.connected and self.discovery_filter is not None:
                client.subscribe([(self.discovery_filter, self.settings['qos'])])
            if self.connected and self.topics:
                client.subscribe([(topic, self.settings['qos']) for topic in self.topics])
            self.ready.set()

    def _disconnect(self, client, userdata, flags, reason, properties):
        with self.lock:
            self.connected = False
            self.cache.clear()
            self.message = 'Disconnected: ' + str(reason)

    def _connect_fail(self, client, userdata):
        with self.lock:
            self.connected = False
            self.message = 'Failed to connect to broker; retrying'
            self.ready.set()

    def _message(self, client, userdata, message):
        with self.lock:
            if self.discovery_filter is not None:
                if not matches_filter(self.discovery_filter, message.topic):
                    return
                if message.topic not in self.cache and len(self.cache) >= self.discovery_limit:
                    self.discovery_capped = True
                    return
                if len(message.topic.encode('utf-8')) > 512 or len(message.payload) > 65536:
                    self.discovery_capped = True
                    return
            elif message.topic not in self.topics:
                return
            try:
                text = message.payload.decode('utf-8')
                try:
                    value = json.loads(text)
                except ValueError:
                    value = text
                if isinstance(value, (list, dict)) or value is None or (isinstance(value, float) and not math.isfinite(value)):
                    raise ValueError('MQTT payload must be a number, boolean, or text')
                if self.discovery_filter is not None and isinstance(value, str):
                    value = value[:4096]
                sample = {'quality': 'good', 'value': value, 'error': ''}
            except (UnicodeError, ValueError) as error:
                sample = {'quality': 'bad', 'value': None, 'error': str(error)}
            self.cache[message.topic] = {**sample, 'timestamp': time.time()}
            self.received += 1

    def configure_topics(self, topics):
        wanted = {topic_name(topic) for topic in topics}
        with self.lock:
            removed, added = self.topics - wanted, wanted - self.topics
            self.topics = wanted
            self.cache = {k: v for k, v in self.cache.items() if k in wanted}
            if self.connected:
                if removed:
                    self.client.unsubscribe(list(removed))
                if added:
                    self.client.subscribe([(topic, self.settings['qos']) for topic in added])

    def read_many(self, addresses):
        with self.lock:
            return {address: dict(self.cache.get(address, {'quality': 'bad', 'value': None, 'error': 'Waiting for a topic message'}) if self.connected else {'quality': 'bad', 'value': None, 'error': self.message}) for address in addresses}

    def read(self, address):
        sample = self.read_many([address])[address]
        if sample['quality'] != 'good':
            raise ValueError(sample['error'])
        return sample['value']

    def write(self, address, value):
        address = topic_name(address)
        with self.lock:
            if not self.connected:
                raise ValueError(self.message)
        payload = value if isinstance(value, str) else json.dumps(value, allow_nan=False)
        info = self.client.publish(address, payload, qos=self.settings['qos'], retain=self.settings['retain'])
        if info.rc != 0:
            raise ValueError('MQTT publish failed: ' + str(info.rc))
        info.wait_for_publish(timeout=self.settings['timeout'])
        if not info.is_published():
            raise ValueError('MQTT publish timed out; delivery is uncertain')
        self.published += 1

    def test(self):
        if not self.connected:
            self.ready.wait(self.settings['timeout'])
        if not self.connected:
            raise ValueError(self.message)
        return {'message': 'Connected to MQTT broker'}

    def status(self):
        with self.lock:
            return {'quality': 'good' if self.connected else 'bad', 'message': self.message,
                    'received': self.received, 'published': self.published, 'subscriptions': len(self.topics)}

    def discovery(self, identity, action='read', pattern='#'):
        if self.discovery_filter is not None:
            raise ValueError('Nested discovery is unavailable')
        with self.lock:
            if action == 'stop':
                entry = self.discoveries.pop(identity, None)
                if entry:
                    entry['driver'].close()
                return {'ok': True}
            if action == 'start':
                pattern = topic_filter(pattern)
                old = self.discoveries.pop(identity, None)
                if old:
                    old['driver'].close()
                if len(self.discoveries) >= 4:
                    raise ValueError('Too many discovery dialogs are open for this source')
                settings = {**self.settings, 'client_id': 'hmi-discovery-' + uuid.uuid4().hex}
                entry = {'driver': MQTTDriver(settings, self.client_factory, pattern), 'seen': time.monotonic()}
                self.discoveries[identity] = entry
                def expire():
                    with self.lock:
                        if self.discoveries.get(identity) is not entry:
                            return
                        if time.monotonic() - entry['seen'] >= 10:
                            self.discoveries.pop(identity, None)
                            entry['driver'].close()
                        else:
                            timer = threading.Timer(5, expire);timer.daemon = True;timer.start()
                timer = threading.Timer(5, expire);timer.daemon = True;timer.start()
            elif action != 'read':
                raise ValueError('Unknown discovery action')
            entry = self.discoveries.get(identity)
            if not entry:
                raise ValueError('Discovery expired; click Refresh Topics to restart')
            entry['seen'] = time.monotonic()
            child = entry['driver']
            with child.lock:
                return {'items': [{'topic': topic, **sample} for topic, sample in sorted(child.cache.items())],
                        'status': child.status(), 'limit': child.discovery_limit, 'capped': child.discovery_capped}

    def browse(self):
        return []

    def close(self):
        with self.lock:
            if self.closed:
                return
            self.closed = True
            entries, self.discoveries = list(self.discoveries.values()), {}
        for entry in entries:
            entry['driver'].close()
        self.client.disconnect()
        self.client.loop_stop()
