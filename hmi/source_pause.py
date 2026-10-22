"""Runtime-only source pause gates; serial sources share their physical-port gate."""
import threading
from functools import wraps
from .modbus_serial import port_key

PAUSABLE={'pycomm3','bacnet','mqtt','modbus','lightyak','database'}
IO_METHODS=('read','read_many','write','test','browse','browse_catalog','describe','properties','discover','discovery')


def serial_port(kind,settings):
    return port_key(settings['serial_port']) if kind=='lightyak' or kind=='modbus' and settings.get('transport')=='rtu' else None


class PauseGate:
    def __init__(self,serial=False):
        self.lock=threading.RLock();self.paused=False;self.serial=serial;self.released=False

    def status(self):
        return {'quality':'paused','paused':True,'message':('Paused — serial port released' if self.released else 'Paused — waiting to release serial port') if self.serial else 'Paused'}

    def attach(self,driver):
        if getattr(driver,'_pause_gate',None) is self:return
        driver._pause_gate=self
        for name in IO_METHODS:
            original=getattr(driver,name,None)
            if not callable(original):continue
            def guarded(*args,_original=original,**kwargs):
                with self.lock:
                    if self.paused:raise ValueError('Source is paused; unpause it before reading or writing')
                    return _original(*args,**kwargs)
            setattr(driver,name,wraps(original)(guarded))
        original_status=getattr(driver,'status',lambda:{'quality':'idle','message':'Status unavailable'})
        driver.status=lambda:self.status() if self.paused else original_status()

    def set_paused(self,paused,drivers):
        # Announce the pause before waiting: queued work must not start new I/O.
        if paused:self.released=False;self.paused=True
        with self.lock:
            if paused and self.serial:
                seen=set()
                for driver in drivers:
                    connection=getattr(driver,'connection',None)
                    bus=getattr(driver,'bus',None)
                    if bus:driver.quality='idle';driver.message='Waiting for first poll after unpause'
                    shared=connection or bus
                    if shared is None or id(shared) in seen:continue
                    seen.add(id(shared))
                    if connection:
                        with connection.lock:
                            connection.disconnect();connection.quality='idle';connection.message='Waiting for first poll after unpause'
                    else:
                        bus.execute(None,0,lambda:bus.client.close(),Exception)
                self.released=True
            if not paused:
                for driver in drivers:
                    connection=getattr(driver,'connection',None)
                    if connection:connection.retry_at=0;connection.failures=0
                    bus=getattr(driver,'bus',None)
                    if bus:
                        with bus.condition:bus.failures.clear()
                self.paused=False
