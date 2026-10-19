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

    def test_replace_preserves_metadata_and_failure_keeps_old_drawing(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            original = root / 'original.svg'
            original.write_text('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>')
            replacement = root / 'updated.svg'
            replacement.write_text('<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="10"/></svg>')
            library = SymbolLibrary(root / 'library')
            identifier = library.add(original, 'Valves')
            library.update(identifier, 'My valve', 'Valves')
            old_path = library.asset_path(library.items[0])
            library.replace(identifier, replacement)
            item = library.items[0]
            self.assertEqual((item['id'], item['name'], item['category']), (identifier, 'My valve', 'Valves'))
            self.assertEqual(item['source_name'], 'updated.svg')
            self.assertFalse(old_path.exists())
            current_path = library.asset_path(item)
            self.assertIn(b'rect', current_path.read_bytes())
            replacement.write_text('invalid SVG')
            before = library.index.read_bytes()
            with self.assertRaises(ValueError): library.replace(identifier, replacement)
            self.assertEqual(library.index.read_bytes(), before)
            self.assertTrue(current_path.exists())
            other = SymbolLibrary(library.root)
            library.update(identifier, 'Renamed', 'Valves')
            replacement.write_text('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1"/></svg>')
            with self.assertRaises(ValueError): other.replace(identifier, replacement)
            self.assertTrue(current_path.exists())
            self.assertEqual(len(list((library.root / 'assets').glob('*.svg'))), 1)

if __name__ == '__main__': unittest.main()
