import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from hmi.alarms import matches
from hmi.service import Service
from hmi.store import Store
from run import make_handler


class AlarmTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.service = Service(Store(Path(self.temp.name)/'test.sqlite3'))
        self.service.add_tag({'id':'level','source':'system','name':'Level'})
        self.rule = {'name':'High Level','message':'Level is high','enabled':True,'event':{'tag':'level','operator':'>','operand':{'kind':'value','value':80}}}
        self.actor = {'id':'operator-id','username':'Operator'}
    def tearDown(self):
        for driver in self.service.drivers.values():driver.close()
        self.temp.cleanup()
    def sample(self, value):
        self.service.polling.update('level',value)
        self.service.evaluate_alarms()
    def save_active(self):
        self.sample(90)
        return self.service.save_alarm(self.rule)
    def test_occurrence_silence_restart_and_reactivation(self):
        alarm=self.save_active();state=self.service.alarm_snapshot()[0]['state']
        self.assertTrue(state['active']);first=state['occurrence']
        result=self.service.silence_alarms({'id':alarm['id'],'occurrence':first,'username':'Forged'},self.actor)
        self.assertEqual(result,{'silenced':1})
        self.assertEqual(self.service.alarm_snapshot()[0]['state']['silenced_by'],'Operator')
        self.assertEqual(self.service.silence_alarms({'all':True},self.actor),{'silenced':0})
        with self.service.store.connect() as db:
            self.assertEqual(db.execute('SELECT username,user_id,occurrence FROM alarm_silences').fetchall(),[('Operator','operator-id',first)])
        restored=Service(Store(self.service.store.path))
        self.assertEqual(restored.alarm_snapshot()[0]['state']['silenced_by'],'Operator')
        self.assertTrue(restored.alarm_snapshot()[0]['state']['active'])
        for driver in restored.drivers.values():driver.close()
        self.sample(0);self.assertFalse(self.service.alarm_snapshot()[0]['state']['active'])
        self.sample(90);state=self.service.alarm_snapshot()[0]['state']
        self.assertNotEqual(state['occurrence'],first);self.assertIsNone(state['silenced_by'])
        with self.assertRaises(ValueError):self.service.silence_alarms({'id':alarm['id'],'occurrence':first},self.actor)
    def test_missing_feedback_does_not_clear_and_disabled_does(self):
        alarm=self.save_active()
        self.service.polling.cache['level']={'quality':'bad','value':None}
        self.service.evaluate_alarms()
        state=self.service.alarm_snapshot()[0]['state'];self.assertTrue(state['active']);self.assertEqual(state['quality'],'bad')
        self.service.save_alarm({**alarm,'enabled':False})
        self.assertFalse(self.service.alarm_snapshot()[0]['state']['active'])
    def test_validation_dependencies_and_references(self):
        alarm=self.save_active()
        self.assertIn('level',self.service.polling.permanent_interest)
        self.assertEqual(self.service.usage('level')[0]['alarm'],alarm['id'])
        with self.assertRaises(ValueError):self.service.remove_tag({'id':'level'})
        for event in [{'tag':'missing','operator':'=','operand':{'value':1}}, {'tag':'level','operator':'=','operand':{'value':float('inf')}}, {'tag':'level','operator':'within_range','operand':{'value':10},'end_operand':{'value':2}}]:
            with self.assertRaises(ValueError):self.service.save_alarm({**self.rule,'name':'Invalid','event':event})
        self.service.remove_alarm({'id':alarm['id']});self.assertNotIn('level',self.service.polling.permanent_interest)
        self.service.remove_tag({'id':'level'})
    def test_conditions_match_browser_semantics(self):
        values={'a':{'quality':'good','value':5},'b':{'quality':'good','value':10}}
        for operator,lower,result in [('=',5,True),('!=',5,False),('<',10,True),('>',10,False),('within_range',1,True),('out_of_range',1,False)]:
            self.assertEqual(matches({'tag':'a','operator':operator,'operand':{'value':lower},'end_operand':{'kind':'tag','tag':'b'}},values),result)
        values['a']['value']='5'
        with self.assertRaises(ValueError):matches({'tag':'a','operator':'=','operand':{'value':5}},values)
    def test_silence_all_ignores_client_filters(self):
        self.save_active();self.service.save_alarm({**self.rule,'name':'Another'})
        self.assertEqual(self.service.silence_alarms({'all':True,'filter':'does not match'},self.actor),{'silenced':2})
    def test_polling_activates_without_browser_interest(self):
        self.service.save_alarm(self.rule)
        self.assertFalse(self.service.polling.leases)
        self.service.drivers['system'].write('Memory/level',95)
        self.service.polling.poll_due(False)
        self.assertTrue(self.service.alarm_snapshot()[0]['state']['active'])
    def test_focused_option_and_silence_share_durable_attribution(self):
        self.sample(90)
        alarm=self.service.save_alarm({**self.rule,'focused':True})
        notice=self.service.alarm_attention()[0]
        self.assertTrue(notice['focused'])
        self.assertNotIn('event',notice)
        self.service.silence_alarms({'id':alarm['id'],'occurrence':notice['state']['occurrence']},self.actor)
        self.assertEqual(self.service.alarm_attention()[0]['state']['silenced_by'],'Operator')
    def test_http_permissions_and_server_supplied_actor(self):
        alarm=self.save_active();handler=make_handler(self.service)
        def request(path,data=None,cookie='',csrf=''):
            body=json.dumps(data).encode() if data is not None else b''
            raw=(('POST' if data is not None else 'GET')+' '+path+' HTTP/1.0\r\n'+f'Cookie: {cookie}\r\nX-CSRF-Token: {csrf}\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n').encode()+body
            class Socket:
                def __init__(self):self.output=io.BytesIO()
                def makefile(self,*args):return io.BytesIO(raw)
                def sendall(self,value):self.output.write(value)
            socket=Socket();handler(socket,('127.0.0.1',1),SimpleNamespace())
            head,body=socket.output.getvalue().split(b'\r\n\r\n',1);lines=head.decode().split('\r\n');headers=dict(line.split(': ',1) for line in lines[1:])
            return int(lines[0].split()[1]),json.loads(body),headers.get('Set-Cookie','')
        self.assertEqual(request('/api/alarms')[0],401)
        _,admin,cookie=request('/api/setup',{'username':'Admin','password':'test-password','safety_acknowledged':True});csrf=request('/api/status',cookie=cookie)[1]['csrf']
        self.assertEqual(request('/api/admin/users/save',{'username':'Operator','password':'test-password'},cookie,csrf)[0],200)
        _,operator,operator_cookie=request('/api/login',{'username':'Operator','password':'test-password'});operator_csrf=request('/api/status',cookie=operator_cookie)[1]['csrf']
        self.assertEqual(request('/api/alarms',cookie=operator_cookie)[0],200)
        self.assertEqual(request('/api/admin/alarms/save',self.rule,operator_cookie,operator_csrf)[0],403)
        state=self.service.alarm_snapshot()[0]['state']
        self.assertEqual(request('/api/alarms/silence',{'id':alarm['id'],'occurrence':state['occurrence'],'username':'Forged'},operator_cookie,operator_csrf)[0],200)
        self.assertEqual(self.service.alarm_snapshot()[0]['state']['silenced_by'],'Operator')
        self.assertEqual(request('/api/alarms/silence',{'all':True},operator_cookie,'wrong-token')[0],403)
        request('/api/admin/users/save',{'username':'Kiosk','password':'test-password','kiosk':True},cookie,csrf)
        _,_,kiosk_cookie=request('/api/login',{'username':'Kiosk','password':'test-password'})
        kiosk_csrf=request('/api/status',cookie=kiosk_cookie)[1]['csrf']
        self.assertEqual(request('/api/alarms',cookie=kiosk_cookie)[0],403)
        self.assertEqual(request('/api/alarms/silence',{'all':True},kiosk_cookie,kiosk_csrf)[0],403)
        self.assertEqual(request('/api/alarms/attention',cookie=kiosk_cookie)[0],200)
        self.assertEqual(request('/api/alarms/silence',{'id':alarm['id'],'occurrence':state['occurrence']},kiosk_cookie,kiosk_csrf)[0],200)

    def test_history_keeps_activation_clear_silence_and_removed_alarm(self):
        from unittest.mock import patch
        with patch('hmi.alarms.time.time',return_value=100):alarm=self.save_active()
        occurrence=self.service.alarm_snapshot()[0]['state']['occurrence']
        with patch('hmi.alarms.time.time',return_value=120):self.service.silence_alarms({'id':alarm['id'],'occurrence':occurrence},self.actor)
        with patch('hmi.alarms.time.time',return_value=150):self.sample(0)
        row=self.service.alarm_history({})['items'][0]
        self.assertEqual((row['activated_at'],row['cleared_at'],row['silenced_at']),(100,150,120))
        self.assertEqual(row['silenced_by'],'Operator')
        with patch('hmi.alarms.time.time',return_value=200):self.sample(90)
        self.assertEqual(self.service.alarm_history({})['total'],2)
        self.assertEqual(self.service.alarm_history({'from':175})['items'][0]['activated_at'],200)
        self.assertEqual(self.service.alarm_history({'text':'operator'})['total'],1)
        self.assertEqual(self.service.alarm_history({'to':125})['total'],1)
        with patch('hmi.alarms.time.time',return_value=230):self.service.remove_alarm({'id':alarm['id']})
        row=self.service.alarm_history({})['items'][0]
        self.assertEqual(row['clear_reason'],'Alarm removed');self.assertEqual(row['cleared_at'],230)
        restored=Service(Store(self.service.store.path));self.assertEqual(restored.alarm_history({})['total'],2)
        for driver in restored.drivers.values():driver.close()
        with self.assertRaises(ValueError):self.service.alarm_history({'from':20,'to':10})
    def test_history_retains_active_occurrence_on_bad_feedback(self):
        self.save_active();self.service.polling.cache['level']={'quality':'bad','value':None};self.service.evaluate_alarms()
        row=self.service.alarm_history({})['items'][0]
        self.assertFalse(row['ended']);self.assertIsNone(row['cleared_at'])
    def test_history_upgrade_does_not_invent_old_clear_time(self):
        alarm=self.save_active();state=self.service.alarm_snapshot()[0]['state']
        self.service.silence_alarms({'id':alarm['id'],'occurrence':state['occurrence']},self.actor)
        self.sample(0)
        self.service.alarms.states[alarm['id']].pop('cleared_at')
        self.service.alarms.states[alarm['id']].pop('clear_reason')
        self.service.store.set('alarm_states',self.service.alarms.states)
        with self.service.store.connect() as db:db.execute('DELETE FROM alarm_history')
        restored=Service(Store(self.service.store.path));row=restored.alarm_history({})['items'][0]
        self.assertEqual(row['silenced_by'],'Operator');self.assertIsNone(row['cleared_at']);self.assertTrue(row['ended'])
        for driver in restored.drivers.values():driver.close()
    def test_history_pagination_is_bounded(self):
        with self.service.store.connect() as db:
            db.executemany('INSERT INTO alarm_history (occurrence,alarm_id,alarm_name,message,activated_at) VALUES (?,?,?,?,?)',[(str(i),'a','High Level','High',i+1) for i in range(60)])
        first=self.service.alarm_history({});last=self.service.alarm_history({'offset':50})
        self.assertEqual(first['total'],60);self.assertEqual(len(first['items']),50);self.assertEqual(len(last['items']),10)
        self.assertFalse({a['occurrence'] for a in first['items']} & {a['occurrence'] for a in last['items']})
