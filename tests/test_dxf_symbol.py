import base64,importlib.util,io,unittest
from unittest.mock import patch
from hmi.symbols import prepare_symbol
@unittest.skipUnless(importlib.util.find_spec('ezdxf'),'Optional ezdxf dependency not installed')
class DXFSymbolTests(unittest.TestCase):
 def drawing(self,version='R2000'):
  import ezdxf
  return ezdxf.new(version)
 def data(self,doc):
  out=io.StringIO();doc.write(out);return {'name':'LibreCAD Test.DXF','data':base64.b64encode(out.getvalue().replace('\n','\r\n').encode('utf-8')).decode()}
 def paths(self,doc):return prepare_symbol(self.data(doc))['symbol']['children']
 def test_basic_geometry(self):
  doc=self.drawing();m=doc.modelspace();m.add_line((0,0),(100,0));m.add_circle((50,30),10);m.add_arc((70,30),10,0,90);m.add_ellipse((100,30),major_axis=(20,0),ratio=.5);m.add_lwpolyline([(0,0,.5),(10,10,0)],format='xyb');m.add_lwpolyline([(0,0),(20,0),(20,10),(0,10)],close=True)
  asset=prepare_symbol(self.data(doc));paths=asset['symbol']['children'];self.assertEqual(len(paths),6);self.assertTrue(all(p['paint']=={'fill':False,'stroke':True} for p in paths));self.assertTrue(any('C' in p['attributes']['d'] for p in paths));self.assertTrue(any(p['attributes']['d'].endswith('Z') for p in paths));self.assertEqual(prepare_symbol(asset)['symbol'],asset['symbol'])
 def test_r12(self):
  doc=self.drawing('R12');doc.modelspace().add_polyline2d([(0,0),(10,0),(10,10)],close=True);paths=self.paths(doc);self.assertEqual(len(paths),1);self.assertTrue(paths[0]['attributes']['d'].endswith('Z'))
 def test_hatch_hole_and_outline(self):
  doc=self.drawing();m=doc.modelspace();h=m.add_hatch();h.paths.add_polyline_path([(0,0),(100,0),(100,100),(0,100)],flags=1);h.paths.add_polyline_path([(20,20),(80,20),(80,80),(20,80)],flags=0);m.add_lwpolyline([(0,0),(100,0),(100,100)],close=True)
  paths=self.paths(doc);self.assertEqual(paths[0]['paint'],{'fill':True,'stroke':False});self.assertEqual(paths[0]['attributes']['fill-rule'],'evenodd');self.assertEqual(paths[0]['attributes']['d'].count('M'),2);self.assertEqual(paths[1]['paint'],{'fill':False,'stroke':True})
 def test_hatch_style_and_solid(self):
  doc=self.drawing();m=doc.modelspace();h=m.add_hatch();h.dxf.hatch_style=2;h.paths.add_polyline_path([(0,0),(100,0),(100,100)],flags=1);h.paths.add_polyline_path([(20,20),(30,20),(30,30)],flags=0);m.add_solid([(0,0),(10,0),(0,10),(10,10)])
  paths=self.paths(doc);self.assertEqual(paths[0]['attributes']['d'].count('M'),1);self.assertTrue(all(p['paint']['fill'] for p in paths))
 def test_block_and_hidden_layer(self):
  doc=self.drawing();m=doc.modelspace();b=doc.blocks.new('Basic');b.add_line((0,0),(10,0));m.add_blockref('Basic',(40,20),dxfattribs={'rotation':90});layer=doc.layers.new('Hidden');layer.off();m.add_line((1000,1000),(2000,1000),dxfattribs={'layer':'Hidden'})
  paths=self.paths(doc);self.assertEqual(len(paths),1);self.assertIn('40 -20',paths[0]['attributes']['d']);self.assertIn('40 -30',paths[0]['attributes']['d'])
 def test_rejected_entities(self):
  doc=self.drawing();doc.modelspace().add_text('Unsupported')
  with self.assertRaisesRegex(ValueError,'TEXT'):self.paths(doc)
  doc=self.drawing();doc.modelspace().add_line((0,0,0),(10,10,10))
  with self.assertRaisesRegex(ValueError,'2D'):self.paths(doc)
  doc=self.drawing();h=doc.modelspace().add_hatch();h.set_pattern_fill('ANSI31');h.paths.add_polyline_path([(0,0),(10,0),(10,10)])
  with self.assertRaisesRegex(ValueError,'solid hatch'):self.paths(doc)
 def test_invalid_and_limits(self):
  for raw in [b'AutoCAD Binary DXF',b'not a DXF']:
   with self.assertRaises(ValueError):prepare_symbol({'name':'test.dxf','data':base64.b64encode(raw).decode()})
  with self.assertRaisesRegex(ValueError,'no supported visible'):self.paths(self.drawing())
  doc=self.drawing();m=doc.modelspace();m.add_line((0,0),(1,1));m.add_line((1,1),(2,2))
  with patch('hmi.dxf_symbol.MAX_ENTITIES',1),self.assertRaisesRegex(ValueError,'too complex'):self.paths(doc)
 def test_spline_y_direction(self):
  doc=self.drawing();doc.modelspace().add_line((5,10),(15,30));doc.modelspace().add_spline([(0,0),(5,8),(10,0)]);paths=self.paths(doc);self.assertIn('M5 -10 L15 -30',paths[0]['attributes']['d']);self.assertIn('C',paths[1]['attributes']['d'])

 def test_dependency_is_only_needed_for_original_dxf(self):
  doc=self.drawing();doc.modelspace().add_line((0,0),(10,0));data=self.data(doc);asset=prepare_symbol(data)
  with patch.dict('sys.modules',{'ezdxf':None}):
   with self.assertRaisesRegex(ValueError,'requirements-dxf'):prepare_symbol(data)
   self.assertEqual(prepare_symbol(asset)['symbol'],asset['symbol'])

 def test_visible_block_attributes_are_not_silently_dropped(self):
  doc=self.drawing();doc.blocks.new('Basic').add_line((0,0),(10,0));insert=doc.modelspace().add_blockref('Basic',(0,0));insert.add_attrib('Label','Pump',(0,0))
  with self.assertRaisesRegex(ValueError,'text attributes'):self.paths(doc)
