"""Small, dependency-free host memory snapshots for the admin status page."""
import ctypes
import platform
from pathlib import Path


def memory_summary(total, available):
    if total <= 0 or not 0 <= available <= total:raise ValueError('Invalid physical memory counters')
    return {'total_bytes':total,'available_bytes':available,'used_bytes':total-available,
            'used_percent':round((total-available)/total*100,1)}


def windows_memory():
    class MemoryStatus(ctypes.Structure):
        _fields_=[('length',ctypes.c_uint32),('load',ctypes.c_uint32)]+[(name,ctypes.c_uint64) for name in
                  ('total','available','page_total','page_available','virtual_total','virtual_available','extended_available')]
    status=MemoryStatus();status.length=ctypes.sizeof(status)
    call=ctypes.WinDLL('kernel32',use_last_error=True).GlobalMemoryStatusEx
    call.argtypes=[ctypes.POINTER(MemoryStatus)];call.restype=ctypes.c_int
    if not call(ctypes.byref(status)):raise ctypes.WinError(ctypes.get_last_error())
    return memory_summary(status.total,status.available)


def linux_memory(text):
    counters={line.split(':',1)[0]:int(line.split(':',1)[1].split()[0])*1024 for line in text.splitlines() if line.startswith(('MemTotal:','MemAvailable:'))}
    return memory_summary(counters['MemTotal'],counters['MemAvailable'])


def system_memory():
    try:
        if platform.system()=='Windows':return windows_memory()
        if platform.system()=='Linux':return linux_memory(Path('/proc/meminfo').read_text(encoding='ascii'))
    except (OSError,ValueError,KeyError,AttributeError):pass
    return None  # Unsupported/unavailable counters must not break Server Status.
