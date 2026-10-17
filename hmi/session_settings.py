import math
import time


def session_settings(data):
    mode = data.get('mode', 'fixed')
    hours = float(data.get('hours', 8))
    if mode not in ('fixed', 'inactivity', 'never') or not math.isfinite(hours) or not 0.01 <= hours <= 8760:
        raise ValueError('Choose a session mode and a duration between 0.01 and 8760 hours')
    return {'mode': mode, 'hours': hours}


def session_valid(record, settings, now=None):
    if not record:
        return False
    now = time.time() if now is None else now
    if settings['mode'] == 'never':
        return True
    origin = record['created'] if settings['mode'] == 'fixed' else record['activity']
    return now - origin < settings['hours'] * 3600
