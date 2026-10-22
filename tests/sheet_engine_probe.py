"""Fresh-process compatibility probe for the restricted sheet engine."""
import importlib.abc
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
reference = '--reference' in sys.argv
attempts = []

class BlockSciPy(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == 'scipy' or fullname.startswith('scipy.'):
            attempts.append(fullname)
            raise ModuleNotFoundError('SciPy is deliberately unavailable')

if not reference:sys.meta_path.insert(0, BlockSciPy())
import formulas
from hmi import sheet_engine
from hmi.sheet import FUNCTIONS
from hmi.service import Service
from hmi.store import Store
if reference:sheet_engine.load_engine = lambda: formulas

CASES = {
 'SUM':'=SUM(1,2,3)', 'AVERAGE':'=AVERAGE(2,4,6)',
 'MIN':'=MIN(2,4,6)', 'MAX':'=MAX(2,4,6)',
 'IF':'=IF(2>1,"yes","no")', 'AND':'=AND(1=1,2=2)',
 'OR':'=OR(1=0,2=2)', 'NOT':'=NOT(1=0)',
 'ABS':'=ABS(-7)', 'ROUND':'=ROUND(1.235,2)',
 'ROUNDUP':'=ROUNDUP(1.231,2)', 'ROUNDDOWN':'=ROUNDDOWN(1.239,2)',
 'LEN':'=LEN("hello")', 'LEFT':'=LEFT("hello",2)',
 'RIGHT':'=RIGHT("hello",2)', 'MID':'=MID("hello",2,3)',
 'CONCATENATE':'=CONCATENATE("he","llo")', 'CONCAT':'=CONCAT("he","llo")',
 'TRIM':'=TRIM("  hello   world  ")', 'UPPER':'=UPPER("hello")',
 'LOWER':'=LOWER("HELLO")', 'COUNT':'=COUNT(1,2,3)',
 'COUNTA':'=COUNTA(1,2,3)', 'IFERROR':'=IFERROR(1/0,99)',
}
assert set(CASES) == FUNCTIONS
expressions = list(CASES.values())
for name in ('SUM','AVERAGE','MIN','MAX','COUNT','COUNTA'):
    for arguments in ('A1:A3','A1:A4','A5:A5','A1:A8','A4','"2",3','"x",3',
                      '1=1,2','A1:A3,A6','A5:A6'):
        expressions.append(f'={name}({arguments})')
expressions += [
 '=IF(AND(SUM(A1:A3)=6,NOT(A1=0)),ROUND(10/3,2),0)',
 '=ROUND(-1.235,2)', '=ROUNDUP(-1.231,2)', '=ROUNDDOWN(-1.239,2)',
 '=IFERROR(AVERAGE(A5:A5),42)', '=IFERROR(1/0,"bad")',
 '="status: "&UPPER("ok")', '=2^3+10/2-1',
 '=AVERAGE(AVERAGE(A1:A3),MIN(A1:A3),MAX(A1:A3))',
 '=SUM(A7,A7)', '=IFERROR(SUM(A8),99)', '=1/0',
 '=AVERAGE("2020-01-01",1)', '=COUNT("2020-01-01",1)',
 '=MIN("2020-01-01",1)', '=MAX("2020-01-01",1)',
]
samples = []
with tempfile.TemporaryDirectory(prefix='oab-sheet-engine-') as directory:
    service = Service(Store(Path(directory) / 'test.sqlite3'))
    service.add_source({'id':'sheet','name':'Sheet','kind':'sheet','settings':{'filename':'Probe'}})
    for start in range(0,len(expressions),45):
        cells = {f'A{i}':{'raw':value} for i,value in enumerate(('1','2','3','text','','-4','=1=1','=1/0'),1)}
        batch = expressions[start:start+45]
        for i,expression in enumerate(batch):cells['BCD'[i//15]+str(i%15+1)]={'raw':expression}
        values = service.save_sheet({'source':'sheet','cells':cells})['values']
        for i,expression in enumerate(batch):
            sample=values['BCD'[i//15]+str(i%15+1)]
            samples.append({'formula':expression,**{key:sample[key] for key in ('value','quality','error')}})

regressions=0
if not reference:
    suite = unittest.defaultTestLoader.loadTestsFromName('tests.test_sheet')
    result = unittest.TextTestRunner(verbosity=0).run(suite)
    assert result.wasSuccessful()
    regressions=result.testsRun
    assert not attempts, attempts
    assert not any(name=='scipy' or name.startswith('scipy.') for name in sys.modules)
    assert not any(name=='formulas.functions.stat' for name in sys.modules)
print(json.dumps({'samples':samples,'functions':len(CASES),'regressions':regressions,'scipy_attempts':attempts}))
