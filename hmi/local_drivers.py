"""Built-in runtime values and persistent scalar tags, without network polling."""
from contextlib import contextmanager
import datetime
import json
import math
import sqlite3
import threading
import time
from pathlib import Path

TIME_FIELDS=('DateTime','Date','Time','Year','Month','Day','Hour','Minute','Second','DayOfWeek','DayOfYear','UnixTimestamp')
SYSTEM_SOURCE={'id':'system','name':'System','kind':'system','settings':{'live':1,'background':1}}
SYSTEM_FIELDS={'Time':TIME_FIELDS,'Runtime':('UptimeSeconds','Uptime'),'Constants':('AlwaysTrue','AlwaysFalse'),'Heartbeat':('Counter','Toggle'),'Connections':('DisconnectedSources',)}

def system_tags():
    return [{'id':('system-time-'+name if folder=='Time' else 'system-'+folder.lower()+'-'+name),'name':name,'source':'system','folder':folder,'address':folder+'/'+name,'writable':False,'builtin':True} for folder,names in SYSTEM_FIELDS.items() for name in names]

def connection_tags(sources):
    return [{'id':'source-connected-'+source['id'],'name':'Connected','source':source['id'],'address':'$status/connected','writable':False,'builtin':True,'connection_status':True,'data_type':'BOOL'} for source in sources if source['kind'] not in ('system','memory','sheet','simulation')]


class SystemDriver:
    def __init__(self,settings):
        self.values={};self.lock=threading.RLock();self.started=time.monotonic();self.disconnected_sources=lambda:0
    def read(self,address):
        if address.startswith('Memory/'):
            with self.lock:return self.values.get(address,0)
        elapsed=max(0,int(time.monotonic()-self.started))
        days,remainder=divmod(elapsed,86400);hours,remainder=divmod(remainder,3600);minutes,seconds=divmod(remainder,60)
        runtime={'Runtime/UptimeSeconds':elapsed,'Runtime/Uptime':f'{days}d {hours:02d}:{minutes:02d}:{seconds:02d}',
                 'Constants/AlwaysTrue':True,'Constants/AlwaysFalse':False,'Heartbeat/Counter':elapsed,'Heartbeat/Toggle':bool(elapsed%2)}
        if address in runtime:return runtime[address]
        if address=='Connections/DisconnectedSources':return self.disconnected_sources()
        now=datetime.datetime.now().astimezone()
        values={'DateTime':f"{now.month}/{now.day}/{now.year} {now.hour % 12 or 12}:{now.minute:02d}:{now.second:02d} {'AM' if now.hour < 12 else 'PM'}",'Date':now.date().isoformat(),'Time':now.strftime('%H:%M:%S'),'Year':now.year,'Month':now.month,'Day':now.day,'Hour':now.hour,'Minute':now.minute,'Second':now.second,'DayOfWeek':now.isoweekday(),'DayOfYear':now.timetuple().tm_yday,'UnixTimestamp':int(now.timestamp())}
        if address.startswith('Time/') and address[5:] in values:return values[address[5:]]
        raise ValueError('Unknown System tag')
    def read_many(self,addresses):return {address:{'value':self.read(address),'quality':'good','error':''} for address in addresses}
    def write(self,address,value):
        if not address.startswith('Memory/'):raise ValueError('Built-in System tags are read only')
        with self.lock:self.values[address]=value
    def browse(self):return []
    def status(self):return {'quality':'good','message':'Built-in Memory and server-local Time'}
    def close(self):pass

def database_settings(settings):
    filename=str(settings.get('filename','')).strip()
    if not filename or Path(filename).name!=filename or any(c in filename for c in '/\\:') or filename in ('.','..'):
        raise ValueError('Choose a database filename without directories')
    if not filename.lower().endswith(('.sqlite','.sqlite3','.db')):filename+='.sqlite3'
    result={'filename':filename}
    for key,default in [('live',.5),('background',20)]:
        value=float(settings.get(key,default))
        if not math.isfinite(value) or not .1<=value<=86400:raise ValueError('Database polling intervals must be 0.1–86400 seconds')
        result[key]=value
    return result

class DatabaseDriver:
    def __init__(self,settings):self.settings=database_settings(settings);self.path=None
    def bind(self,directory):
        directory=Path(directory);directory.mkdir(parents=True,exist_ok=True);self.path=directory/self.settings['filename']
        with self.connect() as db:db.execute('CREATE TABLE IF NOT EXISTS hmi_values (tag_id TEXT PRIMARY KEY, value TEXT NOT NULL)')
    @contextmanager
    def connect(self):
        if self.path is None:raise ValueError('Database is not configured')
        db=sqlite3.connect(self.path,timeout=5)
        try:
            with db:yield db
        finally:db.close()
    def read(self,address):return self.read_many([address])[address]['value']
    def read_many(self,addresses):
        result={address:0 for address in addresses}
        with self.connect() as db:
            for offset in range(0,len(addresses),500):
                chunk=addresses[offset:offset+500]
                if chunk:
                    for key,value in db.execute('SELECT tag_id,value FROM hmi_values WHERE tag_id IN ('+','.join('?' for _ in chunk)+')',chunk):result[key]=json.loads(value)
        return {address:{'value':value,'quality':'good','error':''} for address,value in result.items()}
    def write(self,address,value):
        encoded=json.dumps(value,allow_nan=False)
        with self.connect() as db:db.execute('INSERT OR REPLACE INTO hmi_values VALUES (?,?)',(address,encoded))
    def browse(self):return []
    def status(self):return {'quality':'good' if self.path else 'bad','message':'SQLite — '+self.settings['filename']}
    def close(self):pass
