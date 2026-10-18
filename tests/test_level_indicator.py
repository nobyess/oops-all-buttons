import tempfile
import unittest
from pathlib import Path
from hmi.service import Service
from hmi.store import Store
from hmi.polling import page_tags

class LevelIndicatorTests(unittest.TestCase):
    def test_save_binding_usage_and_limits(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            service=Service(Store(Path(folder)/'test.sqlite3'))
            service.add_source({'id':'memory','name':'Memory','kind':'memory'})
            service.add_tag({'id':'level','name':'Level','source':'memory'})
            control={'id':'tank','type':'level','binding':{'tag':'level'},'minimum':-10,'maximum':20,'fillDirection':'bottom_up'}
            page=service.pages()[0];page['controls']=[control];service.save_page(page)
            self.assertEqual(page_tags(page),{'level'});self.assertTrue(service.usage('level'))
            for values in [{'minimum':20},{'maximum':float('inf')},{'fillDirection':'diagonal'}]:
                with self.assertRaises(ValueError):service.validate_controls([{**control,**values}])

    def test_quiet_surface_default_and_saved_choice(self):
        old={'type':'level','id':'old'}
        disabled={'type':'level','id':'off','quietSurface':False}
        Service.migrate_controls([old,disabled])
        self.assertTrue(old['quietSurface'])
        self.assertFalse(disabled['quietSurface'])
