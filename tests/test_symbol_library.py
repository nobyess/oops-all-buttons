import json
from pathlib import Path
import tempfile
import unittest
from hmi.symbol_library import SymbolLibrary

class LibraryTests(unittest.TestCase):
    def test_lifecycle(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'Pump.svg'
            source.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="red"/></svg>')
            library = SymbolLibrary(root / 'library')
            identifier = library.add(source, 'Pumps')
            target = library.asset_path(library.items[0])
            self.assertTrue(target.exists())
            library.update(identifier, 'Main Pump', 'Equipment')
            restored = SymbolLibrary(root / 'library')
            self.assertEqual(restored.items[0]['name'], 'Main Pump')
            restored.remove(identifier)
            self.assertFalse(target.exists())
            self.assertTrue(source.exists())
            self.assertEqual(restored.items, [])

    def test_external_change_and_invalid_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            library = SymbolLibrary(folder)
            library.save([])
            other = SymbolLibrary(folder)
            library.save([{'id':'x','name':'X','category':'Test','file':'assets/x.svg'}])
            with self.assertRaises(ValueError): other.save([])
            with self.assertRaises(ValueError): library.asset_path({'file':'../outside.svg'})
            with self.assertRaises(ValueError): library.update('x', '', 'Test')
            library.index.write_text('{bad')
            with self.assertRaises(json.JSONDecodeError): library.reload()
            self.assertEqual(library.items[0]['id'], 'x')

if __name__ == '__main__': unittest.main()
