import tempfile
import unittest
from pathlib import Path
try:
    import formulas
except ImportError:
    formulas = None
from hmi.service import Service
from hmi.store import Store


@unittest.skipUnless(formulas, 'Install requirements-sheet.txt to test Sheet formulas')
class SheetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.path = Path(self.temp.name) / 'hmi.sqlite3'
        self.service = Service(Store(self.path))
        self.service.add_source({'id':'mem','name':'Memory1','kind':'memory'})
        self.service.add_tag({'id':'input','name':'Input','source':'mem'})
        self.service.act({'tag':'input','action':'set','value':10})
        self.service.add_source({'id':'sheet','name':'Sheet1','kind':'sheet','settings':{'filename':'Production','background':20,'live':.5}})

    def tearDown(self):
        self.temp.cleanup()

    def save(self, cells, source='sheet'):
        return self.service.save_sheet({'source':source,'cells':{key:{'raw':raw} for key,raw in cells.items()}})

    def test_calculations_ranges_text_and_references(self):
        values = self.save({'A1':'=TAG("Memory1\\Input")','A2':'5','B1':'=SUM(A1:A2)',
                            'B2':'=AVERAGE(A1:A2)','C1':'=IF(B1>10,"Hot","Cold")','D1':'="Status: "&C1','C2':'=MAX(A1:A2)-MIN(A1:A2)'})['values']
        self.assertEqual(values['B1']['value'],15)
        self.assertEqual(values['B2']['value'],7.5)
        self.assertEqual(values['D1']['value'],'Status: Hot')
        self.assertEqual(values['C2']['value'],5)
        self.service.add_tag({'name':'B1','source':'sheet','address':'B1'})
        tag = [t for t in self.service.tags() if not t.get('builtin')][-1]
        self.service.act({'tag':'input','action':'set','value':20})
        self.assertEqual(self.service.values()[tag['id']]['value'],25)

    def test_file_persistence_and_input_writes(self):
        self.save({'A1':'hello','B1':'4','C1':'=B1*2'})
        self.service.add_tag({'name':'B1','source':'sheet','address':'B1'})
        tag = [t for t in self.service.tags() if not t.get('builtin')][-1]
        self.service.act({'tag':tag['id'],'action':'set','value':7})
        restored = Service(Store(self.path))
        data = restored.get_sheet({'source':'sheet'})
        self.assertEqual(data['values']['A1']['value'],'hello')
        self.assertEqual(data['values']['C1']['value'],14)
        self.assertTrue((self.path.parent/'sheets'/'Production.oab-sheet').exists())
        self.service.edit_source({'id':'sheet','name':'Renamed','settings':{'filename':'Renamed','live':1,'background':30}})
        self.assertTrue((self.path.parent/'sheets'/'Renamed.oab-sheet').exists())
        self.assertFalse((self.path.parent/'sheets'/'Production.oab-sheet').exists())
        self.assertEqual(self.service.get_sheet({'source':'sheet'})['values']['C1']['value'],14)

    def test_formula_write_rejected_and_errors_visible(self):
        result = self.save({'A1':'=B1','B1':'=A1','C1':'=1/0','D1':'=Z99','D2':'=NO_SUCH_FUNCTION(1)'})
        for cell in ('A1','B1','C1','D1','D2'):
            self.assertEqual(result['values'][cell]['quality'],'bad')
        self.service.add_tag({'name':'A1','source':'sheet','address':'A1'})
        with self.assertRaisesRegex(ValueError,'Formula cells'):
            self.service.act({'tag':[t for t in self.service.tags() if not t.get('builtin')][-1]['id'],'action':'set','value':2})

    def test_stable_external_ids_usage_and_live_interest(self):
        self.save({'A1':'=TAG("Memory1\\Input")'})
        self.service.edit_tag({'id':'input','name':'Renamed'})
        self.service.edit_source({'id':'mem','name':'New source'})
        data = self.service.get_sheet({'source':'sheet'})
        self.assertEqual(data['cells']['A1']['raw'],'=TAG("New source\\Renamed")')
        self.assertEqual(data['values']['A1']['value'],10)
        with self.assertRaises(ValueError):
            self.service.remove_tag({'id':'input'})
        with self.assertRaises(ValueError):
            self.service.remove_source({'id':'mem'})
        self.service.live_interest('picker',{'sheets':['sheet']})
        self.assertIn('input',self.service.polling.leases['picker'][1])
        self.service.live_interest('picker',{'sheets':[]})
        self.assertNotIn('picker',self.service.polling.leases)

    def test_cross_sheet_and_cycle(self):
        self.save({'A1':'=TAG("Memory1\\Input")'})
        self.service.add_tag({'name':'A1','source':'sheet','address':'A1'})
        self.service.add_source({'id':'sheet2','name':'Sheet2','kind':'sheet','settings':{'filename':'Second'}})
        self.save({'A1':'=TAG("Sheet1\\A1")*2'},'sheet2')
        self.assertEqual(self.service.get_sheet({'source':'sheet2'})['values']['A1']['value'],20)
        self.service.add_tag({'name':'A1','source':'sheet2','address':'A1'})
        self.service.live_interest('viewer',{'tags':[[t for t in self.service.tags() if not t.get('builtin')][-1]['id']]})
        self.assertIn('input', self.service.polling.leases['viewer'][1])
        self.save({'A1':'=TAG("Sheet2\\A1")'})
        self.assertEqual(self.service.get_sheet({'source':'sheet2'})['values']['A1']['quality'],'bad')

    def test_invalid_names_bounds_rates_and_duplicate_import(self):
        with self.assertRaises(ValueError):
            self.service.add_source({'name':'Bad','kind':'sheet','settings':{'filename':'../outside'}})
        with self.assertRaises(ValueError):
            self.service.add_source({'name':'Bad','kind':'sheet','settings':{'filename':'Other','live':0}})
        with self.assertRaises(ValueError):
            self.save({'F1':'bad'})
        with self.assertRaises(ValueError):
            self.save({'A1':'=TAG("Missing\\Tag")'})
        self.service.add_tag({'name':'A1','source':'sheet','address':'A1'})
        with self.assertRaises(ValueError):
            self.service.add_tag({'name':'A1','source':'sheet','address':'A1'})
        with self.assertRaises(ValueError):
            self.service.add_source({'name':'Duplicate','kind':'sheet','settings':{'filename':'Production'}})

    def test_cache_feedback_drives_recalculation_without_device_reads(self):
        class Device:
            reads = 0
            def read_many(self, addresses):
                self.reads += 1
                return {address:{'value':3,'quality':'good'} for address in addresses}
        self.service.store.set('sources',self.service.sources()+[{'id':'device','name':'Device','kind':'pycomm3','settings':{'live':.5,'background':20}}])
        self.service.store.set('tags',[t for t in self.service.tags() if not t.get('builtin')]+[{'id':'remote','name':'Remote','source':'device','address':'Remote'}])
        device = Device()
        self.service.drivers['device'] = device
        self.service.configure_polling()
        self.assertEqual(self.save({'A1':'=TAG("Device\\Remote")*4'})['values']['A1']['quality'], 'bad')
        self.service.add_tag({'name':'A1','source':'sheet','address':'A1'})
        self.service.polling._poll('device',[[t for t in self.service.tags() if not t.get('builtin')][-2]])
        self.assertEqual(device.reads,1)
        self.assertEqual(self.service.values()[[t for t in self.service.tags() if not t.get('builtin')][-1]['id']]['value'],12)
        self.service.get_sheet({'source':'sheet'})
        self.assertEqual(device.reads,1)

    def test_concurrent_memory_updates_keep_derived_feedback_current(self):
        import threading
        self.save({'A1':'=TAG("Memory1\\Input")*2'})
        self.service.add_tag({'name':'A1','source':'sheet','address':'A1'})
        workers = [threading.Thread(target=self.service.act, args=({'tag':'input','action':'increment','value':1},)) for _ in range(10)]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=5)
            self.assertFalse(worker.is_alive())
        self.assertEqual(self.service.values()[[t for t in self.service.tags() if not t.get('builtin')][-1]['id']]['value'],40)

    def test_smaller_grid_preserves_legacy_cells_and_references(self):
        driver = self.service.drivers['sheet']
        driver.replace_cells({'E20': {'raw': '12'}, 'A1': {'raw': '=E20*2'}})
        data = self.service.get_sheet({'source': 'sheet'})
        self.assertEqual(data['values']['A1']['value'], 24)
        self.service.save_sheet({'source': 'sheet', 'cells': data['cells']})
        self.assertEqual(driver.cells['E20']['raw'], '12')
        self.assertEqual(len(driver.browse()), 60)
        with self.assertRaises(ValueError):
            self.service.add_tag({'name':'E20','source':'sheet','address':'E20'})
        with self.assertRaises(ValueError):
            self.save({'E19':'new'})

    def test_validated_save_rejects_errors_without_replacing_file_or_feedback(self):
        self.save({'A1':'7'})
        self.service.add_tag({'name':'A1','source':'sheet','address':'A1'})
        self.service.get_sheet({'source':'sheet'})
        before = (self.path.parent/'sheets'/'Production.oab-sheet').read_text()
        with self.assertRaisesRegex(ValueError, 'A1:'):
            self.service.save_sheet({'source':'sheet','validate':True,'cells':{'A1':{'raw':'=1/0'}}})
        self.assertEqual((self.path.parent/'sheets'/'Production.oab-sheet').read_text(),before)
        self.assertEqual(self.service.values()[[t for t in self.service.tags() if not t.get('builtin')][-1]['id']]['value'],7)
        result = self.service.save_sheet({'source':'sheet','validate':True,'cells':{'A1':{'raw':'=2+3'}}})
        self.assertEqual(result['values']['A1']['value'],5)

    def test_native_export_import_preserves_values_formulas_and_external_references(self):
        self.save({'A1':'=TAG("Memory1\\Input")', 'B1':'=A1+3', 'A2':'hello'})
        payload = self.service.export_sheet({'source':'sheet'})
        imported = self.service.import_sheet({'sheet':payload,'name':'Copy','settings':{'filename':'Copy','live':1,'background':30}})['source']
        result = self.service.get_sheet({'source':imported})
        self.assertEqual(result['values']['B1']['value'],13)
        self.assertEqual(result['values']['A2']['value'],'hello')
        self.assertEqual(result['live'],1)
        self.service.act({'tag':'input','action':'set','value':20})
        self.assertEqual(self.service.get_sheet({'source':imported})['values']['B1']['value'],23)
        with self.assertRaises(ValueError):
            self.service.import_sheet({'sheet':payload,'name':'Other','settings':{'filename':'Copy'}})

    def test_import_self_references_rebind_to_new_sheet(self):
        self.save({'A1':'5'})
        self.service.add_tag({'source':'sheet','name':'A1','address':'A1'})
        self.save({'A1':'5', 'B1':'=TAG("Sheet1\\A1")*2'})
        payload = self.service.export_sheet({'source':'sheet'})
        identity = self.service.import_sheet({'sheet':payload,'name':'Copy','settings':{'filename':'Copy'}})['source']
        data = self.service.get_sheet({'source':identity})
        self.assertEqual(data['cells']['B1']['raw'],'=TAG("Copy\\A1")*2')
        self.assertEqual(data['values']['B1']['value'],10)

    def test_failed_import_rolls_back_and_delete_protects_references(self):
        payload = {'format':'python-hmi-sheet','version':1,'name':'Bad','cells':{'A1':{'raw':'=TAG("Missing\\Tag")'}}}
        count = len(self.service.sources())
        with self.assertRaises(ValueError):
            self.service.import_sheet({'sheet':payload,'settings':{'filename':'Bad'}})
        self.assertEqual(len(self.service.sources()),count)
        self.assertFalse((self.path.parent/'sheets'/'Bad.oab-sheet').exists())
        self.service.add_tag({'source':'sheet','name':'A1','address':'A1'})
        tag = [t for t in self.service.tags() if not t.get('builtin')][-1]
        page = self.service.pages()[0]
        page['controls']=[{'id':'display','type':'numeric','binding':{'tag':tag['id']}}]
        self.service.save_page(page)
        with self.assertRaises(ValueError):
            self.service.delete_sheet({'source':'sheet'})
        self.assertTrue((self.path.parent/'sheets'/'Production.oab-sheet').exists())
        page['controls']=[];self.service.save_page(page)
        self.service.delete_sheet({'source':'sheet'})
        self.assertFalse(any(source['id']=='sheet' for source in self.service.sources()))
        self.assertFalse(any(tag['source']=='sheet' for tag in [t for t in self.service.tags() if not t.get('builtin')]))
        self.assertEqual(len(list((self.path.parent/'sheets'/'.trash').glob('*-Production.oab-sheet'))),1)

    def test_export_import_preserves_hidden_legacy_cells(self):
        self.service.drivers['sheet'].replace_cells({'E20':{'raw':'8'}, 'A1':{'raw':'=E20*2'}})
        payload = self.service.export_sheet({'source':'sheet'})
        identity = self.service.import_sheet({'sheet':payload,'name':'Copy','settings':{'filename':'Copy'}})['source']
        data = self.service.get_sheet({'source':identity})
        self.assertEqual(data['cells']['E20']['raw'],'8')
        self.assertEqual(data['values']['A1']['value'],16)

    def test_boolean_tags_and_formula_results_are_numeric_for_aggregates(self):
        self.service.drivers['mem'].write('input', True)
        # Memory tags created with an explicit identity use that as their address.
        self.service.add_tag({'id':'off','name':'Off','source':'mem'})
        self.service.drivers['mem'].write('off',False)
        data = self.save({'A1':'=TAG("Memory1\\Input")','A2':'=TAG("Memory1\\Off")',
                          'B1':'=SUM(A1:A2)','B2':'=AVERAGE(A1:A2)','B3':'=COUNT(A1:A2)',
                          'C1':'=SUM(TAG("Memory1\\Input"),TAG("Memory1\\Off"))',
                          'C2':'=TRUE','C3':'=FALSE','D1':'=SUM(C2:C3)'})
        values = data['values']
        for address, expected in [('A1',1),('A2',0),('B1',1),('B2',.5),('B3',2),('C1',1),('C2',1),('C3',0),('D1',1)]:
            self.assertEqual(values[address]['value'],expected,address)
            self.assertNotIsInstance(values[address]['value'],bool)
        self.assertIs(self.service.drivers['mem'].read('input'),True)

    def test_legacy_sheet_filenames_remain_readable(self):
        self.service.add_source({'id':'legacy','name':'Legacy','kind':'sheet','settings':{'filename':'Legacy.sheet.json'}})
        self.save({'A1':'42'},source='legacy')
        self.assertTrue((self.path.parent/'sheets'/'Legacy.sheet.json').exists())
        restored=Service(Store(self.path))
        try:self.assertEqual(restored.get_sheet({'source':'legacy'})['values']['A1']['value'],42)
        finally:
            for driver in restored.drivers.values():driver.close()
