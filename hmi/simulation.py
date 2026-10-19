"""Small, deterministic demonstration models; temperatures are exposed in °F."""
import math
import threading
import time

FIELDS = {
    'SupplyAirTemperature': ('°F', False), 'ReturnAirTemperature': ('°F', False),
    'ChilledWaterValveOutput': ('%', False), 'BurnerOutput': ('%', False),
    'BurnerEnableSignal': ('BOOL', False), 'BlowerEnableSignal': ('BOOL', False),
    'AirflowProvingSignal': ('BOOL', False), 'DischargeAirSetpoint': ('°F', True),
    'UnitEnableSignal': ('BOOL', True), 'OutdoorAirTemperature': ('°F', True),
    'MixedAirTemperature': ('°F', False), 'AirflowCFM': ('CFM', False),
    'RoomLoadWatts': ('W', True),
}


def simulation_settings(data=None):
    data = data or {}
    speed = float(data.get('speed', 1))
    if not math.isfinite(speed) or not 1 <= speed <= 60:
        raise ValueError('Simulation speed must be between 1 and 60')
    for key in ('enabled', 'air_handler'):
        if key in data and not isinstance(data[key], bool):
            raise ValueError(key + ' must be a checkbox value')
    return {'enabled': data.get('enabled', False), 'air_handler': data.get('air_handler', True),
            'speed': speed, 'live': .5, 'background': .5}


def simulation_tags():
    return [{'id': 'simulation-airhandler-' + name, 'source': 'simulation',
             'folder': 'AirHandler', 'name': name, 'address': 'AirHandler/' + name,
             'builtin': True, 'writable': writable, 'unit': unit,
             'data_type': 'BOOL' if unit == 'BOOL' else 'REAL'}
            for name, (unit, writable) in FIELDS.items()]


def simulation_writable(tag):
    return any(tag.get('id') == t['id'] and tag.get('source') == t['source']
               and tag.get('address') == t['address'] and t['writable'] for t in simulation_tags())


class SimulationDriver:
    def __init__(self, settings, clock=time.monotonic):
        self.settings = simulation_settings(settings)
        self.clock = clock
        self.last = clock()
        self.lock = threading.RLock()
        self.room = self.supply = (74 - 32) / 1.8
        self.outdoor = (85 - 32) / 1.8
        self.setpoint = (60 - 32) / 1.8
        self.enabled = False
        self.fan_age = self.heat = self.cool = self.integral = 0.
        self.load = 1500.

    def active(self):
        return self.settings['enabled'] and self.settings['air_handler']

    def _advance(self):
        now = self.clock()
        # Bound work after suspend; this is a demo rather than historical replay.
        remaining = min(300., max(0., now - self.last) * self.settings['speed'])
        self.last = now
        if not self.active():
            return
        while remaining > 1e-9:
            dt = min(1., remaining)
            remaining -= dt
            self.fan_age = self.fan_age + dt if self.enabled else 0.
            proved = self.fan_age >= 3
            mixed = .8 * self.room + .2 * self.outdoor if self.enabled else self.room
            error = self.setpoint - self.supply
            if proved:
                self.integral = max(-.4, min(.4, self.integral + error * dt * .0004))
                demand = max(-1., min(1., (self.setpoint - mixed) * 603 / 19000 + .025 * error + self.integral))
                if abs(error) < .05 and abs(demand) < .01:
                    demand = 0.
                self.heat += (max(0., demand) - self.heat) * (1 - math.exp(-dt / 8))
                self.cool += (max(0., -demand) - self.cool) * (1 - math.exp(-dt / 8))
                # One physical mode at a time, including during changeover.
                if demand >= 0: self.cool = 0.
                else: self.heat = 0.
            else:
                self.heat = self.cool = self.integral = 0.
            target = mixed + (self.heat * 18000 - self.cool * 20000) / 603 if proved else mixed
            self.supply += (target - self.supply) * (1 - math.exp(-dt / 20))
            energy = 160 * (self.outdoor - self.room) + self.load
            if proved: energy += 603 * (self.supply - self.room)
            self.room += energy * dt / 4_000_000

    def _values(self):
        running = self.active() and self.enabled
        proved = running and self.fan_age >= 3
        fahrenheit = lambda value: round(value * 1.8 + 32, 2)
        return dict(SupplyAirTemperature=fahrenheit(self.supply), ReturnAirTemperature=fahrenheit(self.room),
                    MixedAirTemperature=fahrenheit(.8*self.room+.2*self.outdoor if running else self.room),
                    OutdoorAirTemperature=fahrenheit(self.outdoor), DischargeAirSetpoint=fahrenheit(self.setpoint),
                    UnitEnableSignal=self.enabled, BlowerEnableSignal=running, AirflowProvingSignal=proved,
                    BurnerEnableSignal=proved and self.heat > .001,
                    BurnerOutput=round(self.heat*100, 2), ChilledWaterValveOutput=round(self.cool*100, 2),
                    AirflowCFM=1060 if proved else 0, RoomLoadWatts=self.load)

    def read_many(self, addresses):
        with self.lock:
            self._advance()
            values = self._values()
            return {address: ({'value': values[address.split('/')[-1]], 'quality': 'good'}
                              if self.active() and address in {'AirHandler/'+n for n in FIELDS}
                              else {'value': None, 'quality': 'bad', 'error': 'Simulation disabled or unknown tag'})
                    for address in addresses}

    def read(self, address):
        sample = self.read_many([address])[address]
        if sample['quality'] != 'good': raise ValueError(sample['error'])
        return sample['value']

    def write(self, address, value):
        with self.lock:
            if not self.active(): raise ValueError('Simulation is disabled')
            if address not in {'AirHandler/'+n for n, (_, writable) in FIELDS.items() if writable}:
                raise ValueError('Simulation output is read only')
            value = float(value)
            if not math.isfinite(value): raise ValueError('Value must be finite')
            name = address.split('/')[-1]
            ranges = {'UnitEnableSignal': (0, 1), 'OutdoorAirTemperature': (-40, 130),
                      'DischargeAirSetpoint': (35, 120), 'RoomLoadWatts': (0, 15000)}
            low, high = ranges[name]
            if not low <= value <= high or name == 'UnitEnableSignal' and value not in (0, 1):
                raise ValueError(f'{name} must be between {low} and {high}')
            self._advance()
            if name == 'UnitEnableSignal':
                self.enabled = bool(value)
                if not self.enabled: self.fan_age = self.heat = self.cool = self.integral = 0.
            elif name == 'OutdoorAirTemperature': self.outdoor = (value-32)/1.8
            elif name == 'DischargeAirSetpoint': self.setpoint = (value-32)/1.8
            else: self.load = value

    def status(self):
        return {'quality': 'good', 'message': 'Air Handler simulation running' if self.active() else 'Simulation disabled'}

    def close(self):
        pass
