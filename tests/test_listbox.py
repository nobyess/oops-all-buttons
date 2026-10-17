import tempfile
import unittest
from pathlib import Path
from hmi.service import Service
from hmi.store import Store
from hmi.polling import page_tags

class ListboxTests(unittest.TestCase):
    def test_binding_actions_usage_and_saved_elements(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            service=Service(Store(Path(folder)/'test.sqlite3'))
            service.add_source({'id':'memory','name':'Memory','kind':'memory'})
            service.add_tag({'id':'index','name':'Index','source':'memory'})
            service.add_tag({'id':'target','name':'Target','source':'memory'})
            page=service.pages()[0]
            page['controls']=[{'id':'list','type':'listbox','binding':{'tag':'index'},'touchable':True,
                'elements':['First','Second','Third','Fourth','Fifth'],
                'actions':[{'id':'changed','trigger':'user_changed','action':'set','tag':'target','value':10}]}]
            service.save_page(page)
            saved=service.pages()[0]['controls'][0]
            self.assertEqual(saved['elements'][4],'Fifth')
            self.assertEqual(saved['actions'][0]['trigger'],'user_changed')
            service.validate_rule('actions',saved['actions'][0])
            self.assertIn('index',page_tags(page))
            self.assertTrue(service.usage('index'))
            with self.assertRaises(ValueError):service.remove_tag({'id':'index'})
            service.validate_controls([saved])
            with self.assertRaisesRegex(ValueError,'text lines'):
                service.validate_controls([{**saved,'elements':[1]}])
