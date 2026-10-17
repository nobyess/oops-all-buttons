import unittest
from unittest.mock import patch
from hmi.system_stats import memory_summary,linux_memory,system_memory
class MemoryTests(unittest.TestCase):
 def test_linux_available_includes_reclaimable_memory(self):
  result=linux_memory('MemTotal: 1000 kB\nMemFree: 10 kB\nMemAvailable: 400 kB\n')
  self.assertEqual(result,{'total_bytes':1024000,'available_bytes':409600,'used_bytes':614400,'used_percent':60.0})
 def test_invalid_and_unavailable_counters(self):
  for total,available in [(0,0),(100,101),(100,-1)]:
   with self.assertRaises(ValueError):memory_summary(total,available)
  with patch('hmi.system_stats.platform.system',return_value='Unsupported'):self.assertIsNone(system_memory())
  with patch('hmi.system_stats.platform.system',return_value='Windows'),patch('hmi.system_stats.windows_memory',side_effect=OSError):self.assertIsNone(system_memory())
 def test_host_memory_if_supported(self):
  result=system_memory()
  if result is not None:
   self.assertGreater(result['total_bytes'],0);self.assertGreaterEqual(result['used_percent'],0);self.assertLessEqual(result['used_percent'],100)
