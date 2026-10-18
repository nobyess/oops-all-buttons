"""Condition-based alarms. No device I/O or browser session is needed here."""
import copy
import json
import math
import time
import uuid
from .events import OPERATORS


def matches(event, samples):
    def number(value):
        if not isinstance(value, (int, float, bool)) or not math.isfinite(value):
            raise ValueError('Alarm comparison requires a finite numeric value')
        return value
    def tag(identity):
        sample = samples.get(identity, {})
        if sample.get('quality') != 'good':
            raise ValueError('Tag unavailable')
        return number(sample.get('value'))
    def operand(key):
        item = event.get(key, {})
        return tag(item.get('tag')) if item.get('kind') == 'tag' else number(item.get('value', 0))
    value, lower = tag(event['tag']), operand('operand')
    operator = event['operator']
    if operator == '=': return value == lower
    if operator == '!=': return value != lower
    if operator == '<': return value < lower
    if operator == '>': return value > lower
    upper = operand('end_operand')
    if lower > upper: raise ValueError('Range start exceeds range end')
    within = lower <= value <= upper
    return not within if operator == 'out_of_range' else within


class Alarms:
    # Access under Service.lock, including persistence and evaluation.
    def __init__(self, store):
        self.store = store
        self.items = store.get('alarms', [])
        self.states = store.get('alarm_states', {})
        with store.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS alarm_silences (id TEXT PRIMARY KEY, occurrence TEXT NOT NULL, alarm_id TEXT NOT NULL, alarm_name TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT NOT NULL, silenced_at REAL NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS alarm_history (occurrence TEXT PRIMARY KEY, alarm_id TEXT NOT NULL, alarm_name TEXT NOT NULL, message TEXT NOT NULL, activated_at REAL, cleared_at REAL, ended INTEGER NOT NULL DEFAULT 0, clear_reason TEXT, silenced_by TEXT, silenced_user_id TEXT, silenced_at REAL)')
            db.execute('CREATE INDEX IF NOT EXISTS alarm_history_activated ON alarm_history(activated_at DESC)')
            db.execute('CREATE INDEX IF NOT EXISTS alarm_history_recent ON alarm_history(COALESCE(activated_at,silenced_at) DESC,occurrence DESC)')
            self.write_history(db, [(alarm,self.states[alarm['id']]) for alarm in self.items if self.states.get(alarm['id'],{}).get('occurrence')])
            # Older versions recorded silences but not every activation/clear.
            # Retain those records without inventing missing timestamps.
            db.execute("INSERT OR IGNORE INTO alarm_history (occurrence,alarm_id,alarm_name,message,ended,clear_reason,silenced_by,silenced_user_id,silenced_at) SELECT occurrence,alarm_id,alarm_name,'',1,'Earlier timestamps not recorded',username,user_id,silenced_at FROM alarm_silences")

    @staticmethod
    def write_history(db, entries):
        for alarm,state in entries:
            if not state.get('occurrence'):continue
            db.execute('INSERT OR IGNORE INTO alarm_history (occurrence,alarm_id,alarm_name,message,activated_at) VALUES (?,?,?,?,?)', (state['occurrence'],alarm['id'],alarm['name'],alarm.get('message',''),state.get('activated_at')))
            if not state.get('active'):
                db.execute('UPDATE alarm_history SET ended=1,cleared_at=?,clear_reason=? WHERE occurrence=? AND ended=0', (state.get('cleared_at'),state.get('clear_reason') or 'Earlier clear time not recorded',state['occurrence']))
            if state.get('silenced_at'):
                db.execute('UPDATE alarm_history SET silenced_by=?,silenced_user_id=?,silenced_at=? WHERE occurrence=?', (state.get('silenced_by'),state.get('silenced_user_id'),state['silenced_at'],state['occurrence']))

    def dependencies(self):
        return {identity for alarm in self.items if alarm['enabled'] for identity in self.event_tags(alarm['event'])}

    @staticmethod
    def event_tags(event):
        return {event.get('tag'), *[event.get(key, {}).get('tag') for key in ('operand', 'end_operand') if event.get(key, {}).get('kind') == 'tag']} - {None, ''}

    @staticmethod
    def can_silence(alarm, actor):
        if actor.get('administrator'):return True
        required=alarm.get('requiredRoles',[])
        return isinstance(required,list) and set(required).issubset(actor.get('roles',[]))

    def persist(self, audits=(), definitions=False, history=()):
        with self.store.connect() as db:
            entries = [('alarm_states', self.states)]
            if definitions: entries.append(('alarms', self.items))
            db.executemany('INSERT OR REPLACE INTO config VALUES (?, ?)', [(key, json.dumps(value)) for key, value in entries])
            db.executemany('INSERT INTO alarm_silences VALUES (?, ?, ?, ?, ?, ?, ?)', audits)
            self.write_history(db,history)

    def history(self, data):
        text=str(data.get('text','')).strip().lower()[:500]
        offset=data.get('offset',0)
        if isinstance(offset,bool) or not isinstance(offset,int) or not 0<=offset<=10_000_000:raise ValueError('Invalid history offset')
        clauses,params=[],[]
        for key,operator in [('from','>='),('to','<=')]:
            value=data.get(key)
            if value is not None:
                if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value):raise ValueError('Invalid history date')
                clauses.append('activated_at '+operator+' ?');params.append(value)
        if data.get('from') is not None and data.get('to') is not None and data['from']>data['to']:raise ValueError('From must be before To')
        if text:
            clauses.append("(instr(lower(alarm_name),?)>0 OR instr(lower(message),?)>0 OR instr(lower(COALESCE(silenced_by,'')),?)>0)");params.extend([text]*3)
        where=' WHERE '+' AND '.join(clauses) if clauses else ''
        with self.store.connect() as db:
            total=db.execute('SELECT COUNT(*) FROM alarm_history'+where,params).fetchone()[0]
            cursor=db.execute('SELECT * FROM alarm_history'+where+' ORDER BY COALESCE(activated_at,silenced_at) DESC,occurrence DESC LIMIT 50 OFFSET ?',params+[offset])
            columns=[column[0] for column in cursor.description]
            rows=[dict(zip(columns,row)) for row in cursor]
        return {'items':rows,'total':total,'offset':offset}

    def save(self, data, tags):
        identity = data.get('id') or uuid.uuid4().hex
        original = next((a for a in self.items if a['id'] == identity), None)
        if data.get('id') and original is None: raise ValueError('Unknown alarm')
        name, message = str(data.get('name', '')).strip(), str(data.get('message', '')).strip()
        if not name or len(name) > 150: raise ValueError('Alarm name is required (150 characters maximum)')
        if len(message) > 2000: raise ValueError('Alarm message is too long')
        if any(a['id'] != identity and a['name'].casefold() == name.casefold() for a in self.items): raise ValueError('Alarm name already exists')
        required=data.get('requiredRoles',(original or {}).get('requiredRoles',[]))
        known_roles={role['id'] for role in self.store.get('access_roles',[])}
        if not isinstance(required,list) or any(not isinstance(role,str) or role not in known_roles for role in required):raise ValueError('Choose existing access roles for silencing')
        event = data.get('event', {})
        if not isinstance(event, dict) or event.get('operator') not in OPERATORS: raise ValueError('Choose an alarm comparison')
        known = {t['id'] for t in tags}
        if event.get('tag') not in known: raise ValueError('Choose a condition tag')
        rule = {'tag': event['tag'], 'operator': event['operator']}
        keys = ['operand'] + (['end_operand'] if event['operator'] in ('range', 'within_range', 'out_of_range') else [])
        for key in keys:
            item = event.get(key, {})
            if not isinstance(item, dict): raise ValueError('Invalid comparison operand')
            if item.get('kind') == 'tag':
                if item.get('tag') not in known: raise ValueError('Choose a comparison tag')
                rule[key] = {'kind': 'tag', 'tag': item['tag']}
            elif item.get('kind', 'value') == 'value':
                value = item.get('value')
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value): raise ValueError('Comparison must be a finite number')
                rule[key] = {'kind': 'value', 'value': value}
            else: raise ValueError('Choose Value or Tag')
        if len(keys) == 2 and all(rule[k]['kind'] == 'value' for k in keys) and rule['operand']['value'] > rule['end_operand']['value']: raise ValueError('Range end must be at least range start')
        alarm = {'id': identity, 'name': name, 'message': message, 'enabled': data.get('enabled', True) is True, 'focused': data.get('focused', False) is True, 'requiredRoles':list(dict.fromkeys(required)), 'event': rule}
        if original: self.items[self.items.index(original)] = alarm
        else: self.items.append(alarm)
        # A changed condition begins a fresh occurrence on the next evaluation.
        history=[]
        if original and original['event'] != rule:
            state=self.states.pop(identity,None)
            if state and state.get('active'):
                history.append((original,{**state,'active':False,'cleared_at':time.time(),'clear_reason':'Condition changed'}))
        self.persist(definitions=True,history=history)
        return copy.deepcopy(alarm)

    def remove(self, identity):
        if not any(a['id'] == identity for a in self.items): raise ValueError('Unknown alarm')
        alarm=next(a for a in self.items if a['id']==identity)
        self.items = [a for a in self.items if a['id'] != identity]
        state=self.states.pop(identity, None)
        history=[(alarm,{**state,'active':False,'cleared_at':time.time(),'clear_reason':'Alarm removed'})] if state and state.get('active') else []
        self.persist(definitions=True,history=history)

    def evaluate(self, samples):
        original_states=self.states
        self.states=dict(self.states)
        changed = False
        history=[]
        for alarm in self.items:
            previous = self.states.get(alarm['id'], {})
            state = dict(previous)
            try:
                active = alarm['enabled'] and matches(alarm['event'], samples)
                state['quality'] = 'good'
                state['error'] = ''
            except (ValueError, TypeError, KeyError) as error:
                # Missing feedback is not proof an active alarm has cleared.
                active = previous.get('active', False)
                state['quality'], state['error'] = 'bad', str(error)
            if active and not previous.get('active'):
                state.update(occurrence=uuid.uuid4().hex, activated_at=time.time(), cleared_at=None,clear_reason=None,silenced_by=None, silenced_user_id=None, silenced_at=None)
            if not active and previous.get('active'):
                state.update(cleared_at=time.time(),clear_reason='Condition cleared' if alarm['enabled'] else 'Alarm disabled')
            state['active'] = bool(active)
            if state != previous:
                self.states[alarm['id']] = state
                changed = True
                history.append((alarm,state))
        if changed:
            try:self.persist(history=history)
            except Exception:
                self.states=original_states
                raise

    def silence(self, data, actor):
        previous_states = copy.deepcopy(self.states)
        all_alarms = data.get('all') is True
        if not all_alarms:
            alarm=next((alarm for alarm in self.items if alarm['id']==data.get('id')),None)
            if alarm is not None and not self.can_silence(alarm,actor):raise PermissionError('You do not have the required access roles to silence this alarm')
            state = self.states.get(data.get('id'), {})
            if not state.get('active') or state.get('occurrence') != data.get('occurrence'): raise ValueError('Alarm changed; refresh the active list')
        audits = []
        skipped=0
        for alarm in self.items:
            state = self.states.get(alarm['id'], {})
            if not state.get('active') or state.get('silenced_at') or (not all_alarms and alarm['id'] != data['id']): continue
            if not self.can_silence(alarm,actor):
                skipped+=1
                continue
            stamp = time.time()
            state.update(silenced_by=actor['username'], silenced_user_id=actor['id'], silenced_at=stamp)
            audits.append((uuid.uuid4().hex, state['occurrence'], alarm['id'], alarm['name'], actor['id'], actor['username'], stamp))
        if audits:
            try: self.persist(audits,history=[(alarm,self.states[alarm['id']]) for alarm in self.items if self.states.get(alarm['id'],{}).get('silenced_at')])
            except Exception:
                self.states = previous_states
                raise
        return {'silenced': len(audits),**({'skipped':skipped} if skipped else {})}

    def snapshot(self):
        return copy.deepcopy([{**alarm, 'state': self.states.get(alarm['id'], {})} for alarm in self.items])
