"""Compare the app's limited registry against the unmodified upstream engine."""
import json
import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest


@unittest.skipUnless(importlib.util.find_spec('formulas') and importlib.util.find_spec('scipy'),
                     'Install the upstream sheet dependencies for differential tests')
class SheetEngineTests(unittest.TestCase):
    def test_whole_function_set_matches_upstream_without_scipy(self):
        probe=Path(__file__).with_name('sheet_engine_probe.py')
        def run(*flags):
            result=subprocess.run([sys.executable,str(probe),*flags],capture_output=True,text=True,timeout=90)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            return json.loads(result.stdout)
        original=run('--reference')
        limited=run()
        self.assertEqual(limited['functions'],24)
        self.assertEqual(limited['samples'],original['samples'])
        self.assertEqual(len(limited['samples']),100)
        self.assertEqual(limited['scipy_attempts'],[])
        self.assertEqual(limited['regressions'],16)
