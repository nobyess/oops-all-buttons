import unittest
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from hmi.mqtt import MQTTDriver, mqtt_settings, topic_name
from hmi.service import Service
from hmi.store import Store

class FakeClient:
    def __init__(self, identity):self.identity=identity;self.subscriptions=[];self.sent=[]
    def username_pw_set(self,*args):self.credentials=args
    def tls_set(self):self.tls=True
    def reconnect_delay_set(self,*args):pass
    def connect_async(self,*args):self.connection=args
    def loop_start(self):self.on_connect(self,None,None,0,None)
    def loop_stop(self):pass
    def disconnect(self):self.on_disconnect(self,None,None,0,None)
    def subscribe(self,topics):self.subscriptions.extend(topics)
    def unsubscribe(self,topics):self.removed=topics
    def publish(self,*args,**kwargs):
        self.sent.append((args,kwargs))
        return SimpleNamespace(rc=0,wait_for_publish=lambda timeout:None,is_published=lambda:True)

class MQTTTests(unittest.TestCase):
    def test_cache_publish_and_reconnect(self):
        driver=MQTTDriver({'host':'localhost','tls':True,'username':'u','password':'p','qos':1,'retain':True},FakeClient)
        driver.configure_topics(['pump/value'])
        self.assertEqual(driver.client.subscriptions,[('pump/value',1)])
        self.assertEqual(driver.read_many(['pump/value'])['pump/value']['quality'],'bad')
        for payload,value in [(b'1.25',1.25),(b'true',True),(b'hello','hello')]:
            driver._message(None,None,SimpleNamespace(topic='pump/value',payload=payload))
            self.assertEqual(driver.read('pump/value'),value)
        driver.write('pump/value',2)
        self.assertEqual(driver.read('pump/value'),'hello') # No optimistic feedback.
        self.assertEqual(driver.client.sent[0],(('pump/value','2'),{'qos':1,'retain':True}))
        driver._message(None,None,SimpleNamespace(topic='pump/value',payload=b'{"x":1}'))
        self.assertEqual(driver.read_many(['pump/value'])['pump/value']['quality'],'bad')
        driver.close()
        with self.assertRaises(ValueError):driver.write('pump/value',3)
        driver._connect(driver.client,None,None,0,None)
        self.assertEqual(len(driver.client.subscriptions),2)
        driver.configure_topics([])
        self.assertEqual(driver.client.removed,['pump/value'])

    def test_discovery_is_isolated_bounded_and_temporary(self):
        from hmi.mqtt import topic_filter, matches_filter
        driver=MQTTDriver({'host':'localhost','client_id':'saved-client'},FakeClient)
        driver.configure_topics(['saved/value'])
        result=driver.discovery('tab','start','plant/#')
        self.assertEqual(result['items'],[])
        child=driver.discoveries['tab']['driver']
        self.assertNotEqual(child.client.identity,'saved-client')
        self.assertEqual(child.client.subscriptions,[('plant/#',0)])
        child.discovery_limit=2
        for topic,payload in [('plant/a',b'1'),('outside',b'2'),('plant/b',b'true'),('plant/c',b'3'),('plant/a',b'4')]:
            child._message(None,None,SimpleNamespace(topic=topic,payload=payload))
        result=driver.discovery('tab')
        self.assertTrue(result['capped'])
        self.assertEqual([(row['topic'],row['value']) for row in result['items']],[('plant/a',4),('plant/b',True)])
        self.assertEqual(driver.cache,{})
        self.assertEqual(driver.topics,{'saved/value'})
        driver.discovery('tab','stop')
        self.assertTrue(child.closed)
        with self.assertRaises(ValueError):driver.discovery('tab')
        self.assertTrue(matches_filter('plant/+/speed','plant/pump/speed'))
        self.assertFalse(matches_filter('#','$SYS/broker'))
        self.assertTrue(matches_filter('plant/#','plant'))
        for pattern in ['plant/#/x','plant/ab+','']:
            with self.assertRaises(ValueError):topic_filter(pattern)
        driver.close()

    def test_validation_and_service_identity(self):
        for topic in ['','#','a/+','a'+chr(0)]:
            with self.assertRaises(ValueError):topic_name(topic)
        with self.assertRaises(ValueError):mqtt_settings({'host':'a','qos':3})
        with tempfile.TemporaryDirectory() as folder, patch.dict('hmi.service.DRIVERS',{'mqtt':lambda settings:MQTTDriver(settings,FakeClient)}):
            service=Service(Store(Path(folder)/'hmi.sqlite3'))
            service.add_source({'name':'Broker','kind':'mqtt','settings':{'host':'localhost'}})
            source=service.sources()[0]
            service.add_tag({'name':'Speed','source':source['id'],'address':'pump/value'})
            tag=service.tags()[0]
            self.assertEqual(service.drivers[source['id']].topics,{'pump/value'})
            service.edit_tag({'id':tag['id'],'name':'Speed2','address':'pump/new'})
            self.assertEqual(service.tags()[0]['id'],tag['id'])
            self.assertEqual(service.drivers[source['id']].topics,{'pump/new'})
            service.remove_tag({'id':tag['id']})
            self.assertEqual(service.drivers[source['id']].topics,set())

class PahoWireTests(unittest.TestCase):
    def test_real_paho_subscribe_receive_publish(self):
        import importlib.util
        if importlib.util.find_spec('paho') is None:
            self.skipTest('Optional paho-mqtt not installed')
        import socket
        import threading
        import time
        received=[]
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',0));listener.listen();listener.settimeout(5)
            def packet(connection):
                header=connection.recv(1)
                if not header:return None,None
                length=0;multiplier=1
                while True:
                    byte=connection.recv(1)[0];length+=(byte & 127)*multiplier
                    if byte<128:break
                    multiplier*=128
                body=b''
                while len(body)<length:body+=connection.recv(length-len(body))
                return header[0],body
            def broker():
                with listener.accept()[0] as connection:
                    connection.settimeout(5)
                    try:
                        while True:
                            header,body=packet(connection)
                            if header is None:return
                            kind=header>>4
                            if kind==1:connection.sendall(b'\x20\x02\x00\x00')
                            elif kind==8:
                                connection.sendall(b'\x90\x03'+body[:2]+b'\x00')
                                topic=b'pump/value';payload=len(topic).to_bytes(2,'big')+topic+b'12.5'
                                connection.sendall(b'\x30'+bytes([len(payload)])+payload)
                            elif kind==3:
                                received.append(body)
                                connection.sendall(b'\x30'+bytes([len(body)])+body)
                            elif kind==14:return
                    except (OSError,IndexError):return
            worker=threading.Thread(target=broker,daemon=True);worker.start()
            driver=MQTTDriver({'host':'127.0.0.1','port':listener.getsockname()[1]})
            try:
                driver.configure_topics(['pump/value']);driver.test()
                until=time.monotonic()+5
                while driver.read_many(['pump/value'])['pump/value']['quality']!='good' and time.monotonic()<until:time.sleep(.01)
                self.assertEqual(driver.read('pump/value'),12.5)
                driver.write('pump/value',7)
                until=time.monotonic()+5
                while driver.read('pump/value')!=7 and time.monotonic()<until:time.sleep(.01)
                self.assertEqual(driver.read('pump/value'),7)
                self.assertTrue(received)
            finally:
                driver.close();worker.join(2)
