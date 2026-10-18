import copy
import threading
import unittest
from collections import Counter
from unittest.mock import patch
from hmi.service import Service
from hmi.polling import PollingManager


class SnapshotStore:
    def __init__(self, data):
        self.data, self.reads = data, Counter()
    def get(self, key, default=None):
        self.reads[key] += 1
        return copy.deepcopy(self.data.get(key, default))


class CatalogPerformanceTests(unittest.TestCase):
    def setUp(self):
        self.service = Service.__new__(Service)
        self.service.lock = threading.RLock()
        self.service.drivers = {}
        self.service.source_errors = {}
        self.service.connection_tags = []
        from types import SimpleNamespace
        self.service.alarms=SimpleNamespace(items=[])
        self.service.polling = PollingManager()
        self.data = {
            'sources': [{'id': 's', 'name': 'PLC', 'kind': 'memory'}],
            'tags': [{'id': 'a', 'name': 'A', 'source': 's'}, {'id': 'b', 'name': 'B', 'source': 's'}],
            'pages': [{'id': 'p', 'name': 'Main', 'actions': [{'action': 'navigate', 'page': 'q', 'parameters': {'x': 'b'}}],
                'controls': [{'id': 'c', 'name': 'Motor', 'binding': {'tag': 'a'}, 'textRefs': {'PLC\\A': 'a'},
                    'actions': [{'action': 'set', 'tag': 'a'}],
                    'events': [{'action': 'show', 'tag': 'a', 'operator': 'within_range',
                        'operand': {'kind': 'tag', 'tag': 'b'}, 'end_operand': {'kind': 'tag', 'tag': 'b'}}]}],
                'groups': [{'id': 'g', 'name': 'Assembly', 'events': [{'action': 'hide', 'tag': 'a'}]}]},
                {'id': 'q', 'name': 'Popup', 'controls': []}]
        }
        self.service.store = SnapshotStore(self.data)

    def test_catalog_reads_once_and_preserves_all_reference_kinds(self):
        catalog = self.service.tag_catalog()
        self.assertEqual(self.service.store.reads, {'tags': 1, 'sources': 1, 'pages': 1})
        self.assertEqual([use['controlName'] for use in catalog[0]['usage']], ['Motor', 'Assembly'])
        self.assertEqual([use['control'] for use in catalog[1]['usage']], ['@page', 'c'])
        self.assertEqual(catalog[0]['path'], 'PLC\\A')
        self.assertEqual(catalog[0]['usage'][0]['tag'], 'PLC\\A')
        # Renames are reflected immediately, without invalidating a persistent cache.
        self.data['pages'][0]['controls'][0]['name'] = 'New Motor'
        self.assertEqual(self.service.tag_catalog()[0]['usage'][0]['controlName'], 'New Motor')

    def test_page_and_source_catalog_read_counts(self):
        pages = self.service.page_catalog()
        self.assertEqual(self.service.store.reads, {'pages': 1})
        self.assertEqual(pages[1]['usage'][0]['control'], '@page')
        self.service.store.reads.clear()
        sources = self.service.source_catalog()
        self.assertEqual(self.service.store.reads, {'tags': 1, 'sources': 1, 'pages': 1})
        self.assertEqual(sources[0]['tags'], ['a', 'b'])
        self.assertEqual(len(sources[0]['usage']), 4)

    def test_status_refresh_never_builds_references(self):
        status = self.service.source_status()
        self.assertEqual(self.service.store.reads, {'sources': 1})
        self.assertEqual(set(status[0]), {'id', 'status'})
        self.assertEqual(status[0]['status']['quality'], 'bad')

    def test_interest_reads_tags_once_and_skips_unrequested_pages(self):
        self.service.live_interest('tab', {'tags': ['a', 'b', 'missing']})
        self.assertEqual(self.service.store.reads, {'tags': 1})
        self.assertEqual(self.service.polling.leases['tab'][1], {'a', 'b'})
        self.service.store.reads.clear()
        self.service.live_interest('tab', {'pages': ['p']})
        self.assertEqual(self.service.store.reads, {'tags': 1, 'pages': 1})
        self.assertEqual(self.service.polling.leases['tab'][1], {'a', 'b'})

    def test_sheet_dependencies_are_included_once_and_cycles_terminate(self):
        class Sheet:
            def __init__(self, deps): self.deps, self.calls = deps, 0
            def dependencies(self): self.calls += 1; return self.deps
        self.data['sources'].append({'id': 'sheet', 'name': 'Sheet', 'kind': 'sheet'})
        self.data['tags'].append({'id': 'cell', 'name': 'A1', 'source': 'sheet'})
        driver = Sheet({'a', 'cell'})
        self.service.drivers['sheet'] = driver
        with patch('hmi.service.SheetDriver', Sheet):
            catalog = self.service.tag_catalog()
            self.assertEqual(driver.calls, 1)
            self.assertEqual(catalog[0]['usage'][-1]['control'], 'Sheet formula')
            self.service.store.reads.clear()
            self.service.live_interest('tab', {'sheets': ['sheet']})
            self.assertEqual(self.service.polling.leases['tab'][1], {'a', 'cell'})
            self.assertEqual(self.service.store.reads, {'tags': 1})
