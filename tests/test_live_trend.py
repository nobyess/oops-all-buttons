import tempfile,unittest
from pathlib import Path
from hmi.service import Service
from hmi.store import Store
from hmi.polling import page_tags
class TrendTests(unittest.TestCase):
 def test_trend_binding_and_validation(self):
  with tempfile.TemporaryDirectory() as folder:
   service=Service(Store(Path(folder)/'hmi.sqlite3'))
   try:
    service.add_tag({'id':'input','source':'system','name':'Trend Value'})
    control={'id':'trend','type':'trend','binding':{'tag':'input'},'timespan':60,'minimum':-10,'maximum':100}
    page=service.pages()[0];page['controls']=[control];service.save_page(page)
    self.assertEqual(page_tags(page),{'input'});self.assertTrue(service.usage('input'))
    for changes in [{'timespan':0},{'timespan':86401},{'timespan':float('nan')},{'timespan':True},{'minimum':100},{'maximum':float('inf')},{'minimum':False}]:
     with self.subTest(changes=changes),self.assertRaises(ValueError):service.validate_controls([{**control,**changes}])
   finally:
    for driver in service.drivers.values():driver.close()

 def test_multitag_references_parameters_and_export(self):
  from hmi.page_transfer import references,export_page,import_page
  with tempfile.TemporaryDirectory() as folder:
   service=Service(Store(Path(folder)/'hmi.sqlite3'))
   try:
    for identity in ('one','two'):service.add_tag({'id':identity,'source':'system','name':identity})
    control={'id':'trend','type':'trend','series':[{'id':'a','tag':'one','color':'#ff0000'},{'id':'b','tag':'two','color':'#00ff00'}]}
    page=service.pages()[0];page['controls']=[control];service.save_page(page)
    self.assertEqual(page_tags(page),{'one','two'})
    self.assertTrue(service.usage('one'));self.assertTrue(service.usage('two'))
    self.assertEqual({owner[key] for owner,key in references(page)},{'one','two'})
    exported=export_page(service,{'id':page['id']});self.assertEqual(set(exported['tags']),{'one','two'})
    other=Service(Store(Path(folder)/'other.sqlite3'))
    try:
     for old,new in [('one','newone'),('two','newtwo')]:other.add_tag({'id':new,'source':'system','name':old})
     result=import_page(other,{'page':exported,'name':'Imported Trend'})
     copied=next(p for p in other.pages() if p['id']==result['id'])['controls'][0]
     self.assertEqual([s['tag'] for s in copied['series']],['newone','newtwo'])
     self.assertEqual([s['color'] for s in copied['series']],['#ff0000','#00ff00'])
    finally:
     for driver in other.drivers.values():driver.close()
    for series in [[{'id':'a','tag':'missing','color':'#ff0000'}],[{'id':'a','tag':'one','color':'invalid'}],control['series']+[control['series'][0]]]:
     with self.assertRaises(ValueError):service.validate_controls([{**control,'series':series}])
   finally:
    for driver in service.drivers.values():driver.close()

 def test_old_series_opacity_is_removed(self):
  control={'id':'trend','type':'trend','series':[{'id':'a','tag':'one','color':'#2563eb00'}]}
  Service.migrate_controls([control])
  self.assertEqual(control['series'][0]['color'],'#2563eb')

 def test_series_ranges_validate_and_inherit_old_limits(self):
  control={'id':'trend','type':'trend','minimum':-20,'maximum':200,'series':[{'id':'a','tag':'','color':'#2563eb'}]}
  Service.migrate_controls([control]);self.assertEqual((control['series'][0]['minimum'],control['series'][0]['maximum']),(-20,200))
  with tempfile.TemporaryDirectory() as folder:
   service=Service(Store(Path(folder)/'hmi.sqlite3'))
   try:
    service.validate_controls([control])
    for low,high in [(10,10),(20,10),(float('nan'),100),(0,float('inf')),(False,100)]:
     with self.assertRaises(ValueError):service.validate_controls([{**control,'series':[{**control['series'][0],'minimum':low,'maximum':high}]}])
   finally:
    for driver in service.drivers.values():driver.close()
