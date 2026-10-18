"""Repository-backed built-in symbols; independent of the HMI database."""
import base64
import json
import os
from pathlib import Path
import uuid
from .symbols import prepare_symbol

class SymbolLibrary:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.index = self.root / 'index.json'
        self.reload()

    def reload(self):
        original = self.index.read_bytes() if self.index.exists() else None
        data = json.loads(original.decode('utf-8-sig')) if original is not None else {'version': 1, 'symbols': []}
        if data.get('version') != 1 or not isinstance(data.get('symbols'), list):
            raise ValueError('Unsupported symbol catalog')
        seen = set()
        for item in data['symbols']:
            if not all(isinstance(item.get(k), str) and item[k] for k in ('id', 'name', 'category', 'file')):
                raise ValueError('Invalid symbol entry')
            if item['id'] in seen: raise ValueError('Duplicate symbol ID')
            seen.add(item['id'])
            self.asset_path(item)
        self.items, self.original = data['symbols'], original

    def asset_path(self, item):
        relative = Path(item['file'])
        path = (self.root / relative).resolve()
        if relative.is_absolute() or not path.is_relative_to(self.root / 'assets'):
            raise ValueError('Symbol asset must be inside the library assets folder')
        return path

    def save(self, items):
        current = self.index.read_bytes() if self.index.exists() else None
        if current != self.original:
            raise ValueError('Library changed in another window. Reload before editing.')
        raw = (json.dumps({'version': 1, 'symbols': items}, indent=2, ensure_ascii=False) + '\n').encode('utf-8')
        temporary = self.root / ('catalog-' + uuid.uuid4().hex + '.tmp')
        try:
            temporary.write_bytes(raw)
            os.replace(temporary, self.index)
        finally: temporary.unlink(missing_ok=True)
        self.items, self.original = items, raw

    def add(self, filename, category='Uncategorized'):
        source = Path(filename)
        if source.stat().st_size > 5 * 1024 * 1024: raise ValueError('Maximum symbol size is 5 MB')
        asset = prepare_symbol({'name': source.name, 'data': base64.b64encode(source.read_bytes()).decode('ascii')})
        identifier = uuid.uuid4().hex
        item = {'id': identifier, 'name': source.stem, 'category': category.strip() or 'Uncategorized',
                'file': 'assets/' + identifier + '.svg', 'source_name': source.name}
        target = self.asset_path(item)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(base64.b64decode(asset['data']))
        try: self.save([*self.items, item])
        except Exception:
            target.unlink(missing_ok=True)
            raise
        return identifier

    def update(self, identifier, name, category):
        if not name.strip() or not category.strip(): raise ValueError('Name and category are required')
        items = [dict(item) for item in self.items]
        item = next(item for item in items if item['id'] == identifier)
        item.update(name=name.strip(), category=category.strip())
        self.save(items)

    def remove(self, identifier):
        item = next(item for item in self.items if item['id'] == identifier)
        remaining = [entry for entry in self.items if entry['id'] != identifier]
        self.save(remaining)
        if not any(entry['file'] == item['file'] for entry in remaining):
            self.asset_path(item).unlink(missing_ok=True)
