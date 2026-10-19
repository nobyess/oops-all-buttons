import math
import tempfile
import unittest
from pathlib import Path
from hmi.simulation import SimulationDriver, simulation_settings
from hmi.service import Service
from hmi.store import Store


class SimulationTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.driver = SimulationDriver({'enabled': True}, clock=lambda: self.now)

    def read(self, name):
        return self.driver.read('AirHandler/' + name)

    def write(self, name, value):
        self.driver.write('AirHandler/' + name, value)

    def advance(self, seconds):
        for _ in range(seconds):
            self.now += 1
            self.read('SupplyAirTemperature')

    def test_proving_and_shutdown(self):
        self.write('UnitEnableSignal', 1)
        self.assertTrue(self.read('BlowerEnableSignal'))
        self.assertFalse(self.read('AirflowProvingSignal'))
        self.advance(4)
        self.assertTrue(self.read('AirflowProvingSignal'))
        self.write('UnitEnableSignal', 0)
        for name in ['BlowerEnableSignal', 'AirflowProvingSignal', 'BurnerOutput', 'ChilledWaterValveOutput']:
            self.assertFalse(self.read(name))

    def test_cooling_and_room_response(self):
        self.write('UnitEnableSignal', 1)
        self.advance(600)
        self.assertLess(abs(self.read('SupplyAirTemperature')-60), 2)
        self.assertGreater(self.read('ChilledWaterValveOutput'), 0)
        self.assertEqual(self.read('BurnerOutput'), 0)
        self.assertLess(self.read('ReturnAirTemperature'), 74)

    def test_heating_and_changeover(self):
        self.write('OutdoorAirTemperature', 10)
        self.write('DischargeAirSetpoint', 90)
        self.write('UnitEnableSignal', 1)
        self.advance(600)
        self.assertTrue(self.read('BurnerEnableSignal'))
        self.assertLess(abs(self.read('SupplyAirTemperature')-90), 2)
        self.write('DischargeAirSetpoint', 45)
        self.advance(300)
        self.assertEqual(self.read('BurnerOutput'), 0)
        self.assertGreater(self.read('ChilledWaterValveOutput'), 0)

    def test_invalid_writes_do_not_change_model(self):
        for name, value in [('SupplyAirTemperature', 1), ('UnitEnableSignal', .5),
                            ('OutdoorAirTemperature', math.nan), ('RoomLoadWatts', -1)]:
            with self.assertRaises(ValueError): self.write(name, value)
        self.assertEqual(self.read('OutdoorAirTemperature'), 85)
        with self.assertRaises(ValueError): simulation_settings({'speed': math.inf})

    def test_speed_and_bounded_pause(self):
        self.driver.settings['speed'] = 60
        self.write('UnitEnableSignal', 1)
        self.now += 1
        self.assertTrue(self.read('AirflowProvingSignal'))
        self.now += 10**9
        self.assertTrue(math.isfinite(self.read('SupplyAirTemperature')))

    def test_service_lifecycle_and_protected_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory)/'test.sqlite3')
            service = Service(store)
            self.assertFalse(any(t['source']=='simulation' for t in service.tags()))
            service.configure_simulation({'enabled': True})
            tag = next(t for t in service.tag_catalog() if t['path']=='Simulation\\AirHandler\\UnitEnableSignal')
            service.act({'tag': tag['id'], 'action': 'set', 'value': 1})
            self.assertTrue(service.values([tag['id']])[tag['id']]['value'])
            output = next(t for t in service.tags() if t['name']=='SupplyAirTemperature')
            with self.assertRaises(ValueError): service.act({'tag':output['id'],'action':'set','value':50})
            with self.assertRaises(ValueError): service.remove_source({'id':'simulation'})
            with self.assertRaises(ValueError): service.add_tag({'source':'simulation','name':'Extra'})
            service.configure_simulation({'enabled':False})
            self.assertEqual(service.values([tag['id']])[tag['id']]['quality'],'bad')
            service.polling.poll_due(asynchronous=False)
            self.assertNotIn('simulation',service.polling.statistics)
            restored = Service(store)
            self.assertFalse(restored.simulation_config()['enabled'])
            self.assertEqual(len([t for t in restored.tags() if t['source']=='simulation']),13)
            for item in [service,restored]:
                for driver in item.drivers.values():driver.close()
