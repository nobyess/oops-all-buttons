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
            service.add_source({'kind':'simulation','name':'Simulation','settings':{}})
            tag = next(t for t in service.tag_catalog() if t['path']=='Simulation\\AirHandler\\UnitEnableSignal')
            service.act({'tag': tag['id'], 'action': 'set', 'value': 1})
            self.assertTrue(service.values([tag['id']])[tag['id']]['value'])
            output = next(t for t in service.tags() if t['name']=='SupplyAirTemperature')
            with self.assertRaises(ValueError): service.act({'tag':output['id'],'action':'set','value':50})
            page=service.pages()[0];page['controls']=[{'id':'reading','type':'numeric','binding':{'tag':tag['id']}}]
            service.save_page(page)
            with self.assertRaises(ValueError):service.remove_source({'id':'simulation'})
            page['controls']=[];service.save_page(page)
            with self.assertRaisesRegex(ValueError,'Only one'):service.add_source({'kind':'simulation','name':'Other simulation','settings':{}})
            with self.assertRaises(ValueError): service.add_tag({'source':'simulation','name':'Extra'})
            service.edit_source({'id':'simulation','settings':{'air_handler':False,'speed':2}})
            self.assertEqual(service.values([tag['id']])[tag['id']]['quality'],'bad')
            service.polling.poll_due(asynchronous=False)
            self.assertNotIn('simulation',service.polling.statistics)
            restored = Service(store)
            self.assertFalse(next(s for s in restored.sources() if s['kind']=='simulation')['settings']['air_handler'])
            self.assertEqual(len([t for t in restored.tags() if t['source']=='simulation']),13)
            restored.remove_source({'id':'simulation'})
            self.assertFalse(any(t['source']=='simulation' for t in restored.tags()))
            restarted=Service(store)
            self.assertFalse(any(s['kind']=='simulation' for s in restarted.sources()))
            for item in [service,restored,restarted]:
                for driver in item.drivers.values():driver.close()

    def test_legacy_simulation_bindings_survive_source_migration(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(Path(directory)/'test.sqlite3')
            store.set('sources',[{'id':'simulation','name':'Simulation','kind':'simulation','settings':{'enabled':False,'air_handler':True,'speed':5}}])
            identity='simulation-airhandler-SupplyAirTemperature'
            store.set('pages',[{'id':'demo','name':'Demo','controls':[{'id':'temperature','type':'numeric','binding':{'tag':identity}}]}])
            service=Service(store)
            try:
                self.assertEqual(service.pages()[0]['controls'][0]['binding']['tag'],identity)
                self.assertIn(identity,{t['id'] for t in service.tags()})
                self.assertTrue(service.drivers['simulation'].active())
                self.assertEqual(service.drivers['simulation'].settings['speed'],5)
                service.polling.poll_due(False)
                self.assertEqual(service.values({identity})[identity]['quality'],'good')
            finally:
                for driver in service.drivers.values():driver.close()
