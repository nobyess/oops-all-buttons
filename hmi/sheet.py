"""Small persistent sheet driver. Excel expression evaluation is isolated here."""
import json
import math
import re
import threading
from pathlib import Path

CELLS = [f'{col}{row}' for row in range(1, 16) for col in 'ABCD']
TAG_CALL = re.compile(r'\bTAG\s*\(\s*"((?:[^"]|"")*)"\s*\)', re.I)
FUNCTIONS = {'SUM', 'AVERAGE', 'MIN', 'MAX', 'IF', 'AND', 'OR', 'NOT', 'ABS', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'LEN', 'LEFT', 'RIGHT', 'MID', 'CONCATENATE', 'CONCAT', 'TRIM', 'UPPER', 'LOWER', 'COUNT', 'COUNTA', 'IFERROR'}
CELL = re.compile(r'^\$?([A-E])\$?([1-9]|1[0-9]|20)$', re.I)


def sheet_settings(settings):
    name = str(settings.get('filename', 'Sheet.oab-sheet')).strip()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9 _.-]{0,99}', name) or '..' in name:
        raise ValueError('Use a simple sheet filename without folders')
    if not name.lower().endswith(('.oab-sheet','.sheet.json')):
        name = re.sub(r'\.json$', '', name, flags=re.I) + '.oab-sheet'
    result = {'filename': name}
    for key, default in [('background', 20), ('live', .5)]:
        value = float(settings.get(key, default))
        if not math.isfinite(value) or not .1 <= value <= 60:
            raise ValueError('Sheet polling rates must be between 0.1 and 60 seconds')
        result[key] = value
    return result


def cell_address(value):
    match = CELL.fullmatch(str(value))
    if not match:
        raise ValueError('Cell must be A1 through E20')
    return match[1].upper() + match[2]


class SheetDriver:
    def __init__(self, settings):
        try:
            import formulas
        except ImportError:
            raise ValueError('Install Sheet support: python -m pip install -r requirements-sheet.txt') from None
        self.formulas = formulas
        self.settings = sheet_settings(settings)
        self.lock = threading.RLock()
        self.calculation_lock = threading.RLock()
        self.cells, self.compiled = {}, {}
        self.file = None
        self.snapshot = None
        self.changed = None

    def bind(self, directory, snapshot, changed, calculation_lock=None):
        with self.lock:
            if self.file is None:
                directory.mkdir(parents=True, exist_ok=True)
                self.file = directory / self.settings['filename']
                if self.file.exists():
                    data = json.loads(self.file.read_text(encoding='utf-8'))
                    self.cells = self.validate_cells(data.get('cells', {}))
                else:
                    self.persist()
            self.snapshot, self.changed = snapshot, changed
            if calculation_lock is not None:
                self.calculation_lock = calculation_lock

    @staticmethod
    def validate_cells(cells):
        if not isinstance(cells, dict) or len(cells) > 100:
            raise ValueError('Sheet requires up to 100 cells')
        result = {}
        for address, entry in cells.items():
            address = cell_address(address)
            if not isinstance(entry, dict) or not isinstance(entry.get('raw', ''), str) or len(entry.get('raw', '')) > 2000:
                raise ValueError('Each cell requires text of at most 2000 characters')
            refs = entry.get('refs', [])
            if not isinstance(refs, list) or len(refs) > 100 or not all(ref is None or isinstance(ref, str) for ref in refs):
                raise ValueError('Invalid sheet tag references')
            result[address] = {'raw': entry.get('raw', ''), 'refs': list(refs)}
        return result

    def persist(self):
        temporary = self.file.with_suffix('.tmp')
        temporary.write_text(json.dumps({'version': 1, 'cells': self.cells}, indent=2, allow_nan=False), encoding='utf-8')
        temporary.replace(self.file)

    def rename_file(self, settings):
        settings = sheet_settings(settings)
        with self.lock:
            destination = self.file.parent / settings['filename']
            if destination != self.file:
                if destination.exists():
                    raise ValueError('That sheet filename already exists')
                self.file.rename(destination)
                self.file = destination
            self.settings = settings

    def replace_cells(self, cells):
        cells = self.validate_cells(cells)
        with self.calculation_lock, self.lock:
            previous = self.cells
            self.cells = cells
            try:
                self.persist()
            except Exception:
                self.cells = previous
                raise
            self.compiled.clear()
        if self.changed:
            self.changed()

    def dependencies(self):
        with self.lock:
            return {ref for entry in self.cells.values() for ref in entry.get('refs', []) if ref}

    def evaluate(self, address, lookup, memo, visiting):
        address = cell_address(address)
        if address not in CELLS and address not in self.cells:
            raise ValueError('Cell outside A1:D15')
        key = (id(self), address)
        if key in memo:
            return memo[key]
        if key in visiting:
            raise ValueError('Circular sheet reference')
        visiting.add(key)
        try:
            with self.lock:
                entry = self.cells.get(address, {'raw': '', 'refs': []})
                raw = entry['raw']
                if not raw.startswith('='):
                    value = raw[1:] if raw.startswith("'") else raw
                    if raw and not raw.startswith("'"):
                        try:
                            value = float(raw)
                            if not math.isfinite(value):
                                raise ValueError('Non-finite number')
                        except ValueError:
                            value = raw
                else:
                    refs = entry.get('refs', [])
                    index = [0]
                    def substitute(match):
                        name = f'TAGINPUT_{index[0]}'
                        index[0] += 1
                        return name
                    expression = TAG_CALL.sub(substitute, raw)
                    if index[0] != len(refs):
                        raise ValueError('Choose a valid source tag for each TAG() reference')
                    plain = re.sub(r'"(?:[^"]|"")*"', '""', expression)
                    for function_name in re.findall(r'\b([A-Za-z_][A-Za-z0-9_.]*)\s*\(', plain):
                        if function_name.upper() not in FUNCTIONS:
                            raise ValueError('Unsupported function: ' + function_name)
                    function = self.compiled.get(expression)
                    if function is None:
                        function = self.formulas.Parser().ast(expression)[1].compile()
                        self.compiled[expression] = function
                    inputs = []
                    for name in function.inputs:
                        if name.startswith('TAGINPUT_'):
                            ref = refs[int(name.split('_')[-1])]
                            if not ref:
                                raise ValueError('Unknown TAG() reference')
                            item = lookup(ref, memo, visiting)
                            inputs.append(int(item) if isinstance(item, bool) else item)
                        else:
                            bounds = name.split(':')
                            start, end = cell_address(bounds[0]), cell_address(bounds[-1])
                            if len(bounds) == 1:
                                item = self.evaluate(start, lookup, memo, visiting)
                                inputs.append(0 if item == '' else item)
                            else:
                                if start[0] > end[0] or int(start[1:]) > int(end[1:]):
                                    raise ValueError('Invalid cell range')
                                inputs.append([[self.evaluate(f'{col}{row}', lookup, memo, visiting) or 0
                                                for col in 'ABCDE'['ABCDE'.index(start[0]):'ABCDE'.index(end[0])+1]]
                                               for row in range(int(start[1:]), int(end[1:])+1)])
                    value = function(*inputs)
                    if hasattr(value, 'size'):
                        if value.size != 1:
                            raise ValueError('Formula must return one value')
                        value = value.item()
                    if type(value).__name__ in ('XlError', 'Error') or str(value) in ('#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#N/A', '#NUM!', '#NULL!'):
                        raise ValueError(str(value))
                    if hasattr(value, 'item'):
                        value = value.item()
                # Sheet Boolean results are numeric so range aggregates include them.
                if isinstance(value, bool):
                    value = int(value)
                if not isinstance(value, (str, int, float, bool)) or isinstance(value, float) and not math.isfinite(value):
                    raise ValueError('Formula returned an unsupported value')
                memo[key] = value
                return value
        finally:
            visiting.remove(key)

    def read_many(self, addresses):
        samples = self.snapshot()
        return {address: samples[address] for address in addresses}

    def read(self, address):
        sample = self.read_many([address])[address]
        if sample['quality'] != 'good':
            raise ValueError(sample.get('error', 'Cell unavailable'))
        return sample['value']

    def write(self, address, value):
        address = cell_address(address)
        with self.lock:
            if self.cells.get(address, {}).get('raw', '').startswith('='):
                raise ValueError('Formula cells are read-only; edit the sheet formula instead')
            cells = {key: dict(entry) for key, entry in self.cells.items()}
            cells[address] = {'raw': str(value), 'refs': []}
        self.replace_cells(cells)

    def browse(self):
        return [{'address': cell} for cell in CELLS]

    def status(self):
        return {'quality': 'good', 'message': self.settings['filename'] + ' · 4 columns × 15 rows'}

    def close(self):
        pass
