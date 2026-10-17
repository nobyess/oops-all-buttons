import tempfile
import unittest
from pathlib import Path
from hmi.service import Service
from hmi.store import Store
from hmi.polling import page_tags

class InlineTextTests(unittest.TestCase):
    def test_save_reference_usage_interest_rename_and_removal(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            service=Service(Store(Path(folder)/'test.sqlite3'))
            service.add_source({'id':'memory','name':'Memory','kind':'memory'})
            service.add_tag({'id':'value','name':'Test','source':'memory'})
            page=service.pages()[0]
            page['controls']=[{'id':'label','type':'label','text':r'Status @{Memory\Test}',
                'events':[{'id':'e','action':'set_content','content':r'Alarm @{Memory\Test}'}]}]
            service.save_page(page)
            control=service.pages()[0]['controls'][0]
            self.assertEqual(control['textRefs'],{r'Memory\Test':'value'})
            self.assertEqual(control['events'][0]['contentRefs'],{r'Memory\Test':'value'})
            self.assertEqual(page_tags(page),{'value'})
            self.assertEqual(service.usage('value')[0]['control'],'label')
            service.live_interest('tab',{'pages':[page['id']]})
            self.assertIn('value',service.polling.leases['tab'][1])
            with self.assertRaises(ValueError):service.remove_tag({'id':'value'})
            service.edit_tag({'id':'value','name':'Renamed'})
            service.save_page(page)
            self.assertEqual(page['controls'][0]['textRefs'],{r'Memory\Test':'value'})
            page['controls'][0]['text']='Plain'
            page['controls'][0]['events']=[]
            service.save_page(page)
            self.assertNotIn('textRefs',page['controls'][0])
            self.assertEqual(service.usage('value'),[])
            service.remove_tag({'id':'value'})
