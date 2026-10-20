from .simulation import SimulationDriver, simulation_settings, simulation_tags, simulation_writable
from .alarms import Alarms
from .local_drivers import SYSTEM_SOURCE, system_tags, connection_tags, DatabaseDriver, database_settings
"""Application operations shared by HTTP handlers and future automation workers."""
from .assets import AssetCenter, asset_identity
from .error_log import ErrorLog
from .mqtt import mqtt_settings, topic_name
from .modbus import modbus_settings, canonical_address
import math
import threading
import time
import uuid
import re
from pathlib import Path
from .sheet import SheetDriver, CELLS, TAG_CALL, FUNCTIONS, cell_address, sheet_settings
from .events import VISUAL_ACTIONS, OPERATORS
from .actions import ACTIONS, validate_value_input
from .drivers import DRIVERS
from .pages import PAGE_ACTIONS, page_defaults, validate_page
from .polling import PollingManager, page_tags
from .inline_text import bind_inline_text, inline_ids
from .pycomm3_logix import connection_settings
from .bacnet import bacnet_settings
from .tag_paths import tag_path


class Service:
    def __init__(self, store):
        self.store = store
        self.lock = threading.RLock()
        self.assets = AssetCenter(self)
        self.drivers = {}
        self.source_errors = {}
        self.connection_tags = []
        self.simulation_tags = []
        self.error_log = ErrorLog()
        self.alarms = Alarms(store)
        self.polling = PollingManager()
        self.polling.error_log = self.error_log
        self.sheet_lock = threading.RLock()
        self.polling.on_samples = self.recalculate_sheets
        # Existing source IDs become permanent: add display names without rewriting
        # tag references, pages, or connection settings.
        existing_sources = self.store.get('sources', [])
        if any('name' not in source for source in existing_sources):
            self.store.set('sources', [{**source, 'name': source.get('name', source['id'])} for source in existing_sources])
        # Upgrade the legacy driver key; immutable source/tag IDs are untouched.
        existing_sources = self.store.get('sources', [])
        if any(source.get('kind') == 'allen_bradley' for source in existing_sources):
            self.store.set('sources', [{**source, 'kind': 'pycomm3' if source.get('kind') == 'allen_bradley' else source['kind']} for source in existing_sources])
        existing_tags = self.store.get('tags', [])
        if any('name' not in tag for tag in existing_tags):
            self.store.set('tags', [{**tag, 'name': tag.get('name', tag['id'])} for tag in existing_tags])
        stored_sources=self.store.get('sources',[])
        legacy={s['id']:s for s in stored_sources if s['kind']=='memory'}
        stored_tags=self.store.get('tags',[])
        for tag in stored_tags:
            if tag['source'] in legacy:
                tag.update(source='system',folder='Memory',address='Memory/'+tag['id'])
        if legacy or not any(s['id']=='system' for s in stored_sources):
            self.store.set_many({'sources':[s for s in stored_sources if s['kind'] not in ('memory','system')]+[SYSTEM_SOURCE],
                                 'tags':stored_tags})
        self.test_receipts = {}
        self.action_locks = {}
        if self.store.get('pages') is None:
            old = self.store.get('page', {'controls': []})
            self.store.set('pages', [{'id': 'main', 'name': 'Main', **old}])
            self.polling.changed.set()
        migrated = self.pages()
        for page in migrated:
            page_defaults(page)
            self.migrate_controls([page, *page['controls'], *page.get('groups', [])])
        self.store.set('pages', migrated)
        for source in self.sources():
            try:
                driver = DRIVERS[source['kind']](source['settings'])
                if isinstance(driver,DatabaseDriver):driver.bind(Path(self.store.path).parent/'databases')
                if isinstance(driver, SheetDriver):
                    identity = source['id']
                    driver.bind(Path(self.store.path).parent / 'sheets', lambda identity=identity: self.sheet_snapshot()[identity], self.recalculate_sheets, self.sheet_lock)
                self.drivers[source['id']] = driver
            except Exception as exc:
                self.source_errors[source['id']] = str(exc)
                self.error_log.record('Driver: '+source.get('name',source['id']), str(exc))
        self.configure_polling()

    def configure_polling(self):
        self.connection_tags=connection_tags(self.sources())
        self.simulation_tags=simulation_tags() if any(s['kind']=='simulation' for s in self.sources()) else []
        for source in self.sources():
            driver = self.drivers.get(source['id'])
            if isinstance(driver, SheetDriver):
                identity = source['id']
                driver.bind(Path(self.store.path).parent / 'sheets',
                            lambda identity=identity: self.sheet_snapshot()[identity], self.recalculate_sheets, self.sheet_lock)
        for source in self.sources():
            driver = self.drivers.get(source['id'])
            if source['kind'] == 'mqtt' and driver:
                driver.configure_topics([tag['address'] for tag in self.tags() if tag['source'] == source['id'] and not tag.get('connection_status')])
        system=self.drivers.get('system')
        if system:system.disconnected_sources=lambda:sum(not sample.get('value',False) for sample in self.polling.samples({t['id'] for t in self.connection_tags}).values())
        self.polling.configure(self.sources(), self.tags(), self.drivers)
        self.evaluate_alarms()

    def check_sheet_filename(self, filename, exclude=None):
        if any(s['kind'] == 'sheet' and s['id'] != exclude and s['settings']['filename'].casefold() == filename.casefold()
               for s in self.sources()):
            raise ValueError('A source already uses that sheet filename')

    def sheet_driver(self, source_id):
        driver = self.drivers.get(source_id)
        if not isinstance(driver, SheetDriver):
            raise ValueError('Sheet source unavailable; install requirements-sheet.txt and restart')
        return driver

    def sheet_snapshot(self, publish=True):
        # Serialize cache snapshots and calculations; never read a PLC here.
        with self.lock, self.sheet_lock:
            tags = self.tags()
            drivers = dict(self.drivers)
            sheets = {key: driver for key, driver in drivers.items() if isinstance(driver, SheetDriver)}
            samples = self.values({t['id'] for t in tags if t['source'] not in sheets})
            by_id = {t['id']: t for t in tags}
            memo, visiting = {}, set()
            def lookup(identity, memo, visiting):
                tag = by_id.get(identity)
                if not tag:
                    raise ValueError('Referenced tag no longer exists')
                if tag['source'] in sheets:
                    return sheets[tag['source']].evaluate(tag['address'], lookup, memo, visiting)
                sample = samples.get(identity, {})
                if sample.get('quality') != 'good':
                    raise ValueError('Source tag unavailable: ' + tag.get('name', identity))
                return sample['value']
            result = {}
            for identity, driver in sheets.items():
                result[identity] = {}
                addresses = set(CELLS) | {tag['address'] for tag in tags if tag['source'] == identity}
                for address in sorted(addresses):
                    try:
                        value = driver.evaluate(address, lookup, memo, visiting)
                        sample = {'value': value, 'quality': 'good', 'error': ''}
                    except Exception as error:
                        sample = {'value': None, 'quality': 'bad', 'error': str(error)}
                    result[identity][address] = {**sample, 'timestamp': time.time()}
            with self.polling.lock:
                for tag in tags:
                    if publish and tag['source'] in result and self.drivers.get(tag['source']) is drivers.get(tag['source']):
                        self.polling.cache[tag['id']] = dict(result[tag['source']][tag['address']])
            return result

    def recalculate_sheets(self):
        if any(isinstance(driver, SheetDriver) for driver in self.drivers.values()):
            self.sheet_snapshot()
        self.evaluate_alarms()

    def evaluate_alarms(self):
        with self.lock:
            if self.alarms.items:self.alarms.evaluate(self.values(self.alarms.dependencies()))

    def alarm_snapshot(self, actor=None):
        with self.lock:
            result=self.alarms.snapshot()
            samples=self.values({a['event']['tag'] for a in result})
            for alarm in result:
                alarm['current_value']=samples.get(alarm['event']['tag'],{}).get('value')
                if actor is not None:alarm['canSilence']=self.alarms.can_silence(alarm,actor)
            return result

    def save_alarm(self,data):
        with self.lock:
            result=self.alarms.save(data,self.tags())
            self.polling.changed.set()
            self.evaluate_alarms()
            return result

    def remove_alarm(self,data):
        with self.lock:
            self.alarms.remove(data['id'])

    def silence_alarms(self,data,actor):
        with self.lock:return self.alarms.silence(data,actor)

    def alarm_attention(self, actor=None):
        with self.lock:
            return [{'id':alarm['id'],'name':alarm['name'],'message':alarm['message'],
                     'focused':alarm.get('focused',False),'state':dict(self.alarms.states[alarm['id']]),
                     **({'canSilence':self.alarms.can_silence(alarm,actor)} if actor is not None else {})}
                    for alarm in self.alarms.items if self.alarms.states.get(alarm['id'],{}).get('active')]

    def alarm_history(self,data):
        with self.lock:return self.alarms.history(data)

    def get_sheet(self, data):
        driver = self.sheet_driver(data['source'])
        samples = self.sheet_snapshot()[data['source']]
        with driver.lock:
            cells = {key: dict(value) for key, value in driver.cells.items()}
        # Display current names while preserving permanent IDs in the saved file.
        names = {t['id']: tag_path(t, next((s['name'] for s in self.sources() if s['id'] == t['source']), t['source'])) for t in self.tags()}
        for entry in cells.values():
            refs = iter(entry.get('refs', []))
            entry['raw'] = TAG_CALL.sub(lambda match: 'TAG("' + names.get(next(refs, None), match[1]).replace('"', '""') + '")', entry['raw'])
        return {'cells': cells, 'values': samples, 'filename': driver.settings['filename'], 'live': driver.settings['live'], 'functions': sorted(FUNCTIONS)}

    def save_sheet(self, data):
        driver = self.sheet_driver(data['source'])
        cells = driver.validate_cells(data.get('cells', {}))
        if any(address not in CELLS and address not in driver.cells for address in cells):
            raise ValueError('New cells must be within A1:D15')
        tags, sources = self.tags(), self.sources()
        paths = {tag_path(tag, source['name']).casefold(): tag['id']
                 for source in sources for tag in tags if tag['source'] == source['id']}
        for entry in cells.values():
            entry['refs'] = []
            if entry['raw'].startswith('='):
                for match in TAG_CALL.finditer(entry['raw']):
                    path = match[1].replace('""', '"')
                    identity = paths.get(path.casefold())
                    if identity is None:
                        raise ValueError('Unknown tag: ' + path + '. Add it on the Tags page first.')
                    entry['refs'].append(identity)
        if data.get('validate'):
            with self.lock, self.sheet_lock, driver.lock:
                previous, compiled = driver.cells, driver.compiled
                try:
                    driver.cells, driver.compiled = cells, {}
                    samples = self.sheet_snapshot(publish=False)[data['source']]
                    errors = [(address, sample['error']) for address, sample in samples.items()
                              if sample['quality'] == 'bad' and not sample['error'].startswith('Source tag unavailable:')]
                    if errors:
                        raise ValueError(f'{errors[0][0]}: {errors[0][1]}. Correct the cell before continuing.')
                finally:
                    driver.cells, driver.compiled = previous, compiled
                driver.replace_cells(cells)
        else:
            driver.replace_cells(cells)
        return self.get_sheet(data)

    def export_sheet(self, data):
        source = next((source for source in self.sources() if source['id'] == data['source'] and source['kind'] == 'sheet'), None)
        if not source:
            raise ValueError('Unknown sheet')
        sheet = self.get_sheet(data)
        return {'format': 'python-hmi-sheet', 'version': 1, 'columns': 4, 'rows': 15,
                'name': source['name'], 'settings': source['settings'],
                'cells': {address: {'raw': entry['raw']} for address, entry in sheet['cells'].items()}}

    def import_sheet(self, data):
        payload = data.get('sheet', {})
        if payload.get('format') != 'python-hmi-sheet' or payload.get('version') != 1:
            raise ValueError('Choose a Sheet JSON exported by this application')
        settings = sheet_settings(data.get('settings', payload.get('settings', {})))
        if (Path(self.store.path).parent / 'sheets' / settings['filename']).exists():
            raise ValueError('That filename already exists; choose a new filename')
        name = str(data.get('name', payload.get('name', 'Imported Sheet'))).strip()
        cells = SheetDriver.validate_cells(payload.get('cells', {}))
        identity = uuid.uuid4().hex
        created_tags = []
        with self.lock:
            self.add_source({'id': identity, 'name': name, 'kind': 'sheet', 'settings': settings})
            try:
                # Native exports may retain hidden cells from the original A1:E20 grid.
                self.drivers[identity].cells = cells
                for entry in cells.values():
                    if not entry['raw'].startswith('='):
                        continue
                    def bind(match):
                        path = match[1].replace('""', '"')
                        origin, separator, address = path.partition("\\")
                        if origin.casefold() == str(payload.get('name', '')).casefold():
                            origin = name
                        source = next((source for source in self.sources() if source['name'].casefold() == origin.casefold()), None)
                        if source and source['kind'] == 'sheet':
                            address = cell_address(address)
                            tag = next((tag for tag in self.tags() if tag['source'] == source['id'] and tag['address'] == address), None)
                            if not tag:
                                if address not in CELLS and address in self.sheet_driver(source['id']).cells:
                                    self.store.set('tags', self.store.get('tags',[]) + [{'id': uuid.uuid4().hex, 'name': address, 'source': source['id'], 'address': address, 'writable': True}])
                                    self.configure_polling()
                                else:
                                    self.add_tag({'source': source['id'], 'name': address, 'address': address})
                                created_tags.append(self.tags()[-1]['id'])
                        return 'TAG("' + (origin + separator + address).replace('"', '""') + '")'
                    entry['raw'] = TAG_CALL.sub(bind, entry['raw'])
                self.save_sheet({'source': identity, 'cells': cells, 'validate': True})
            except Exception:
                self.drivers[identity].replace_cells({})
                self.remove_source({'id': identity})
                file = Path(self.store.path).parent / 'sheets' / settings['filename']
                file.unlink(missing_ok=True)
                for tag_id in created_tags:
                    if not self.usage(tag_id):
                        self.remove_tag({'id': tag_id})
                raise
        return {'source': identity}

    def delete_sheet(self, data):
        with self.lock:
            driver = self.sheet_driver(data['source'])
            related = [tag for tag in self.tags() if tag['source'] == data['source']]
            if any(use.get('source') != data['source'] for tag in related for use in self.usage(tag['id'])):
                raise ValueError('Sheet is referenced by a page or another sheet. Remove those references first.')
            file = driver.file
            trash = file.parent / '.trash'
            trash.mkdir(exist_ok=True)
            destination = trash / (uuid.uuid4().hex + '-' + file.name)
            with driver.lock:
                file.rename(destination)
            try:
                self.remove_source({'id': data['source']})
            except Exception:
                destination.rename(file)
                raise
        return {'ok': True}

    def test_source(self, data):
        if data.get('id'):
            source = next((s for s in self.sources() if s['id'] == data['id']), None)
            if not source or source['kind'] not in ('pycomm3', 'bacnet', 'mqtt', 'modbus'):
                raise ValueError('Choose a protocol source')
            driver = self.drivers.get(source['id'])
            if driver is None:
                driver = DRIVERS[source['kind']](source['settings'])
                self.drivers[source['id']] = driver
                self.configure_polling()
            result = driver.test()
            with self.lock:
                current = self.sources()
                for row in current:
                    if row['id'] == source['id']:
                        row['tested_at'] = time.time()
                self.store.set('sources', current)
            return result
        kind = data.get('kind', 'pycomm3')
        if kind not in ('pycomm3', 'bacnet', 'mqtt', 'modbus'):
            raise ValueError('This driver has no connection test')
        settings = (modbus_settings if kind == 'modbus' else mqtt_settings if kind == 'mqtt' else bacnet_settings if kind == 'bacnet' else connection_settings)(data.get('settings', {}))
        driver = DRIVERS[kind](settings)
        try:
            result = driver.test()
        finally:
            driver.close()
        token = uuid.uuid4().hex
        with self.lock:
            self.test_receipts = {k: v for k, v in self.test_receipts.items() if time.time() - v[1] < 1800}
            self.test_receipts[token] = (settings, time.time())
        return {**result, 'test_token': token}

    def browse_source(self, data):
        source = next((s for s in self.sources() if s['id'] == data['source']), None)
        if not source or source['kind'] not in ('pycomm3', 'bacnet'):
            raise ValueError('This source does not support tag discovery')
        driver = self.drivers.get(source['id'])
        if driver is None:
            raise ValueError(self.source_errors.get(source['id'], 'Source unavailable'))
        if source['kind'] == 'bacnet':
            if data.get('properties'):
                result = driver.properties(str(data.get('node', '')))
                existing = {tag['address'] for tag in self.tags() if tag['source'] == source['id']}
                for item in result['items']:
                    item['added'] = item['address'] in existing
                return result
            return driver.browse(str(data.get('node', '')), max(0, int(data.get('offset', 0))), str(data.get('search', '')), bool(data.get('refresh')))
        if source['settings'].get('protocol', 'logix') != 'logix':
            raise ValueError('Use the SLC or CIP tag entry dialog for this source')
        result = driver.browse(str(data.get('node', '')), max(0, int(data.get('offset', 0))),
                               str(data.get('search', '')), bool(data.get('refresh')), tree=bool(data.get('tree')))
        existing = {t['address'] for t in self.tags() if t['source'] == source['id']}
        for item in result['items']:
            item['added'] = item['address'] in existing
        return result

    def preview_source_tag(self, data):
        # A single read for the selected external tag; never create it or write.
        with self.lock:
            source = next((s for s in self.sources() if s['id'] == data.get('source')), None)
            if not source or source['kind'] not in ('pycomm3', 'bacnet') or (source['kind'] == 'pycomm3' and source['settings'].get('protocol', 'logix') != 'logix'):
                raise ValueError('Tag preview is available for PyComm3 Logix and BACnet sources')
            driver = self.drivers.get(source['id'])
            address = str(data.get('address', '')).strip()
            if not driver or not address:
                raise ValueError('Choose an available source and tag')
        try:
            if source['kind'] == 'pycomm3':
                driver.describe(address)
            value = driver.read(address)
            if value is None or not isinstance(value, (str, int, float, bool)) or not self.polling.valid_value(value):
                raise ValueError('Select a scalar tag to preview its value')
            return {'value': value, 'quality': 'good', 'timestamp': time.time()}
        except Exception as error:
            return {'value': None, 'quality': 'bad', 'timestamp': time.time(), 'error': str(error)}

    def live_interest(self, client, data):
        page_ids = set(data.get('pages', []))
        tags = self.tags()
        by_id = {tag['id']: tag for tag in tags}
        known_tags = by_id.keys()
        wanted = set(data.get('tags', [])) & known_tags
        if page_ids:
            for page in self.pages():
                if page['id'] in page_ids:
                    wanted.update(page_tags(page) & known_tags)
        for identity in data.get('sheets', []):
            wanted.update(t['id'] for t in tags if t['source'] == identity)
            driver = self.drivers.get(identity)
            if isinstance(driver, SheetDriver):
                wanted.update(driver.dependencies())
        pending = list(wanted)
        while pending:
            identity = pending.pop()
            tag = by_id.get(identity)
            driver = self.drivers.get(tag['source']) if tag else None
            if isinstance(driver, SheetDriver):
                extra = driver.dependencies() - wanted
                wanted.update(extra); pending.extend(extra)
        self.polling.interest(client, wanted)
        return {'ok': True}

    def pages(self):
        return self.store.get('pages', [])

    @staticmethod
    def migrate_controls(controls):
        for control in controls:
            if not isinstance(control.get('name'), str) or not control['name'].strip():
                control['name'] = control.get('id', '')
            control.setdefault('visible', True)
            if control.get('type')=='level':control.setdefault('quietSurface',True)
            if control.get('type')=='numeric':control.pop('promptText',None)
            if control.get('type')=='trend' and isinstance(control.get('series'),list):
                for series in control['series']:
                    if isinstance(series,dict):
                        series.setdefault('minimum',control.get('minimum',0));series.setdefault('maximum',control.get('maximum',100))
                    if isinstance(series,dict) and isinstance(series.get('color'),str) and re.fullmatch(r'#[0-9a-fA-F]{8}',series['color']):series['color']=series['color'][:7]
            old_tag = control.pop('tag', '')
            if old_tag and control.get('type') in ('numeric', 'indicator'):
                control.setdefault('binding', {'tag': old_tag})
            elif old_tag:
                # Preserve old references without exposing a control Tag property.
                control.setdefault('binding', {'tag': old_tag})
            if 'actions' not in control:
                control['actions'] = ([{'id': uuid.uuid4().hex, 'tag': old_tag,
                    'action': control.get('action', 'increment'), 'value': control.get('value', 1),
                    'enabled': bool(old_tag), 'trigger': 'click'}] if control.get('type') == 'button' else [])
            for action in control.get('actions', []):
                if action.get('action') == 'clear':
                    action.update(action='set', value=0)
                action.pop('enabled', None)
                action.setdefault('trigger', 'click')
            for event in control.get('events', []):
                if event.get('action') == 'clear':
                    event.update(action='set', amount=0)
                event.pop('enabled', None)
                event.setdefault('operand', {'kind': 'value', 'value': event.get('value', 0)})
                event.setdefault('end_operand', {'kind': 'value', 'value': event.get('upper', 100)})
                if event.get('operator') == 'range':
                    event['operator'] = 'within_range'

    def save_page(self, data):
        with self.lock:
            if not isinstance(data.get('controls'), list) or not str(data.get('name', '')).strip():
                raise ValueError('A page needs a name and controls list')
            pages = self.pages()
            if not any(p['id'] == data['id'] for p in pages):
                raise ValueError('Page does not exist')
            self.migrate_controls([data, *data['controls'], *data.get('groups', [])])
            validate_page(data)
            bind_inline_text([data, *data['controls'], *data.get('groups', [])], self.tags(), self.sources(), data['parameters'])
            # Preserve all draft rules; validate them only when executing.
            self.validate_controls([{**c, 'actions': [], 'events': []} for c in data['controls']], strict_bindings=False)
            self.store.set('pages', [data if p['id'] == data['id'] else p for p in pages])
            self.polling.changed.set()
            return []

    def validate_rule(self, kind, item):
        if kind not in ('actions', 'events'):
            raise ValueError('Unknown rule type')
        self.validate_controls([{'id': 'validation', kind: [{**item, 'enabled': True}]}])

    def validate_controls(self, controls, strict_bindings=True):
        """Reject broken references before saving or enabling automation."""
        tags = {tag['id']: tag for tag in self.tags()}
        ids = set()
        def reference(name, writable=False):
            if name not in tags:
                raise ValueError(f'Unknown target tag: {name}')
            if writable and tags[name].get('builtin') and not simulation_writable(tags[name]):raise ValueError('Built-in tags are read only')
            if writable and tags[name].get('data_type', '') in ('STRING', 'STRINGN') and not any(s['id']==tags[name]['source'] and s['kind']=='bacnet' for s in self.sources()):
                raise ValueError('Numeric actions cannot write string tags')
        asset_map={item['id']:item for item in self.assets.records()} if strict_bindings else {}
        for control in controls:
            if not isinstance(control, dict) or not control.get('id') or control['id'] in ids:
                raise ValueError('Control IDs must be present and unique')
            ids.add(control['id'])
            asset=asset_map.get(asset_identity(control.get('image','')))
            if asset and control.get('type') in ('symbol','image') and asset['kind']!=control['type']:raise ValueError('Content type does not match the control')
            if asset and control.get('type')=='button' and (asset['kind'] not in ('image','symbol') or asset['kind']!=control.get('buttonArtworkKind')):raise ValueError('Content type does not match the button artwork')
            if strict_bindings and control.get('binding', {}).get('tag'):
                reference(control['binding']['tag'])
            for key in ('left', 'top', 'width', 'height', 'fontSize', 'strokeWidth', 'edgeDiameter', 'displayDigits'):
                if key in control and (not isinstance(control[key], (float, int)) or not math.isfinite(control[key])):
                    raise ValueError(f'Invalid {key}')
                if key in ('strokeWidth', 'edgeDiameter') and control.get(key, 0) < 0:
                    raise ValueError(f'{key} must be nonnegative')
            if 'displayDigits' in control and (not 0 <= control['displayDigits'] <= 15 or control['displayDigits'] != int(control['displayDigits'])):
                raise ValueError('Display Digits must be a whole number from 0 to 15')
            if control.get('type')=='numeric':
                for key,limit in [('unitText',80)]:
                    if key in control and (not isinstance(control[key],str) or len(control[key])>limit):
                        raise ValueError(f'{key} must be text of at most {limit} characters')
            if control.get('type') == 'trend':
                series=control.get('series',[])
                if not isinstance(series,list) or len(series)>16 or any(not isinstance(s,dict) or not isinstance(s.get('id'),str) or not s['id'] or not isinstance(s.get('tag',''),str) or not re.fullmatch(r'#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?',str(s.get('color',''))) for s in series):
                    raise ValueError('Live Trend supports up to 16 tags with a color for each')
                if len({s['id'] for s in series})!=len(series):raise ValueError('Live Trend series IDs must be unique')
                if strict_bindings:
                    for item in series:
                        if item.get('tag'):reference(item['tag'])
                for item in series:
                    low,high=item.get('minimum',control.get('minimum',0)),item.get('maximum',control.get('maximum',100))
                    if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in (low,high)) or high<=low or not math.isfinite(high-low):raise ValueError('Each Live Trend tag Max must be greater than its Min')
                span=control.get('timespan',60)
                minimum,maximum=control.get('minimum',0),control.get('maximum',100)
                if isinstance(span,bool) or not isinstance(span,(int,float)) or not math.isfinite(span) or not 1<=span<=86400:
                    raise ValueError('Live Trend timespan must be between 1 and 86400 seconds')
                if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in (minimum,maximum)) or maximum<=minimum or not math.isfinite(maximum-minimum):
                    raise ValueError('Live Trend maximum must be greater than its minimum')
            if control.get('type') == 'level':
                minimum, maximum = control.get('minimum', 0), control.get('maximum', 100)
                if (not isinstance(minimum, (int, float)) or not isinstance(maximum, (int, float))
                        or not math.isfinite(minimum) or not math.isfinite(maximum) or maximum <= minimum):
                    raise ValueError('Level Indicator maximum must be greater than its minimum')
                if control.get('fillDirection', 'bottom_up') not in ('bottom_up', 'top_down', 'left_right', 'right_left'):
                    raise ValueError('Invalid Level Indicator fill direction')
            if control.get('type') in ('listbox','dropdown') and (not isinstance(control.get('requiredRoles',[]),list) or any(not isinstance(role,str) for role in control.get('requiredRoles',[]))):
                raise ValueError('Listbox access roles must be a list of role IDs')
            if control.get('type') in ('listbox','dropdown') and (not isinstance(control.get('elements', []), list) or any(not isinstance(line, str) for line in control.get('elements', []))):
                raise ValueError('Listbox elements must be text lines')
            if control.get('type') == 'polyline' and 'points' in control:
                points = control['points']
                if (not isinstance(points, list) or not 2 <= len(points) <= 1000
                        or any(not isinstance(point, list) or len(point) != 2
                               or any(not isinstance(value, (int, float)) or not math.isfinite(value)
                                      or not 0 <= value <= 1 for value in point) for point in points)):
                    raise ValueError('Polyline needs 2–1000 points within its bounds')
            for action in control.get('actions', []):
                if not action.get('enabled', False):
                    continue
                if action.get('action') in PAGE_ACTIONS:
                    if action.get('trigger') in ('page_open', 'page_close'):
                        raise ValueError('Navigation and popup actions are only available on controls')
                    if action.get('enabled'):
                        if not any(p['id'] == action.get('page') for p in self.pages()):
                            raise ValueError('Choose an existing destination page')
                        if action.get('trigger', 'click') not in ('mouse_down', 'mouse_up', 'click', 'page_open', 'page_close', 'user_changed'):
                            raise ValueError('Invalid mouse action trigger')
                        if action.get('action') == 'popup' and action.get('position', 'centered') not in ('centered', 'mouse'):
                            raise ValueError('Invalid popup position')
                    continue
                if action.get('tag'):
                    reference(action['tag'], bool(action.get('enabled')))
                if not action.get('enabled', False):
                    continue
                reference(action.get('tag'), True)
                if action.get('trigger', 'click') not in ('mouse_down', 'mouse_up', 'click', 'page_open', 'page_close', 'user_changed'):
                    raise ValueError('Invalid mouse action trigger')
                if action.get('action') == 'value_input':
                    validate_value_input(action)
                    continue
                if action.get('action') not in ACTIONS or not math.isfinite(float(action.get('value', 1))):
                    raise ValueError('Invalid action')
            event_ids = set()
            for event in control.get('events', []):
                if not event.get('enabled', False):
                    continue
                if not event.get('id') or event['id'] in event_ids:
                    raise ValueError('Event IDs must be present and unique')
                event_ids.add(event['id'])
                # An incomplete disabled rule may be saved while it is being authored.
                names = [event.get('tag')]
                if event.get('action') not in VISUAL_ACTIONS:
                    names.append(event.get('target'))
                for name in names:
                    if name:
                        reference(name)
                operand_keys = ['operand']
                if event.get('operator') in ('range', 'within_range', 'out_of_range'):
                    operand_keys.append('end_operand')
                for key in operand_keys:
                    operand = event.get(key, {})
                    if operand.get('kind') == 'tag' and operand.get('tag'):
                        reference(operand['tag'])
                if not event.get('enabled'):
                    continue
                reference(event.get('tag'))
                visual = event.get('action') in VISUAL_ACTIONS
                if not visual:
                    reference(event.get('target'), True)
                if event.get('operator') not in OPERATORS or event.get('action') not in (set(ACTIONS) | VISUAL_ACTIONS):
                    raise ValueError('Invalid event comparison or action')
                operands = [event.get('operand', {'value': event.get('value', 0)})]
                if event['operator'] in ('range', 'within_range', 'out_of_range'):
                    operands.append(event.get('end_operand', {'value': event.get('upper', 0)}))
                for operand in operands:
                    if operand.get('kind') == 'tag':
                        reference(operand.get('tag'))
                    elif not math.isfinite(float(operand.get('value', 0))):
                        raise ValueError('Event values must be finite')
                if len(operands) == 2 and all(o.get('kind', 'value') == 'value' for o in operands):
                    if float(operands[0].get('value', 0)) > float(operands[1].get('value', 0)):
                        raise ValueError('Range end must be at least range start')
                if event.get('action') == 'spin':
                    rpm = event.get('rpm', 10)
                    if isinstance(rpm, bool) or not isinstance(rpm, (int, float)) or not math.isfinite(rpm) or not 0 <= rpm <= 60:
                        raise ValueError('Spin speed must be between 0 and 60 RPM')
                if event.get('action') == 'set_colors':
                    if 'strokeWidth' in event and (not isinstance(event['strokeWidth'], (int, float)) or not math.isfinite(event['strokeWidth']) or event['strokeWidth'] < 0):
                        raise ValueError('Event Stroke Width must be nonnegative and finite')
                    for color in ('backColor', 'foreColor'):
                        if not re.fullmatch(r'#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?', event.get(color, '')):
                            raise ValueError('Set Colors requires background and foreground colors')

    def add_page(self, data):
        with self.lock:
            name = str(data['name']).strip()
            if not name:
                raise ValueError('Page name is required')
            page = page_defaults({'id': uuid.uuid4().hex, 'name': name, 'controls': []})
            self.store.set('pages', self.pages() + [page])
            self.polling.changed.set()
            return page

    def remove_page(self, data):
        with self.lock:
            references = self.page_usage(data['id'])
            if references:
                raise ValueError('Page is used by navigation/popup actions. Remove those actions first.')
            self.store.set('pages', [p for p in self.pages() if p['id'] != data['id']])
            self.polling.changed.set()

    @staticmethod
    def page_usage_index(pages):
        uses = {}
        for page in pages:
            for control in [page, *page['controls'], *page.get('groups', [])]:
                targets = {action.get('page') for action in control.get('actions', [])
                           if action.get('action') in PAGE_ACTIONS}
                for identity in targets - {None, page['id']}:
                    uses.setdefault(identity, []).append({'page': page['id'], 'name': page['name'],
                        'control': '@page' if control is page else control['id'],
                        'controlName': page['name'] if control is page else control.get('name', control['id'])})
        return uses

    def page_usage(self, page_id):
        return self.page_usage_index(self.pages()).get(page_id, [])

    def page_catalog(self):
        pages = self.pages()
        uses = self.page_usage_index(pages)
        return [{**page, 'usage': uses.get(page['id'], [])} for page in pages]

    def reference_index(self, tags, sources, pages):
        names = {source['id']: source.get('name', source['id']) for source in sources}
        paths = {tag['id']: tag_path(tag, names.get(tag['source'], tag['source'])) for tag in tags}
        uses = {}
        for page in pages:
            for control in [page, *page['controls'], *page.get('groups', [])]:
                refs = [control.get('binding', {}).get('tag'), *inline_ids(control)]
                if control.get('type')=='trend':refs += [s.get('tag') for s in control.get('series',[])]
                refs += [a.get('tag') for a in control.get('actions', []) if a.get('action') not in PAGE_ACTIONS]
                refs += [identity for action in control.get('actions', [])
                         if action.get('action') in PAGE_ACTIONS and isinstance(action.get('parameters'), dict)
                         for identity in action['parameters'].values()]
                for event in control.get('events', []):
                    refs.append(event.get('tag'))
                    if event.get('action') not in VISUAL_ACTIONS:
                        refs.append(event.get('target'))
                    keys = ['operand', 'end_operand'] if event.get('operator') in ('range', 'within_range', 'out_of_range') else ['operand']
                    refs.extend(event.get(key, {}).get('tag') for key in keys
                                if event.get(key, {}).get('kind') == 'tag')
                for identity in set(refs) - {None, ''}:
                    uses.setdefault(identity, []).append({'page': page['id'], 'name': page['name'],
                        'control': '@page' if control is page else control['id'],
                        'controlName': page['name'] if control is page else control.get('name', control['id']),
                        'tag': paths.get(identity, identity)})
        for alarm in self.alarms.items:
            for identity in self.alarms.event_tags(alarm['event']):
                uses.setdefault(identity, []).append({'page':None,'name':'Alarms','control':alarm['name'],'controlName':alarm['name'],'alarm':alarm['id'],'tag':paths.get(identity,identity)})
        for source in sources:
            driver = self.drivers.get(source['id'])
            if isinstance(driver, SheetDriver):
                for identity in driver.dependencies():
                    uses.setdefault(identity, []).append({'page': None, 'name': source['name'],
                        'control': 'Sheet formula', 'tag': paths.get(identity, identity), 'source': source['id']})
        return uses

    def usage(self, tag_id):
        with self.lock:
            tags, sources, pages = self.tags(), self.sources(), self.pages()
        return self.reference_index(tags, sources, pages).get(tag_id, [])

    def tag_catalog(self):
        with self.lock:
            tags, sources, pages = self.tags(), self.sources(), self.pages()
        names = {source['id']: source.get('name', source['id']) for source in sources}
        uses = self.reference_index(tags, sources, pages)
        return [{**tag, 'path': tag_path(tag, names.get(tag['source'], tag['source'])),
                 'source_name': names.get(tag['source'], tag['source']), 'usage': uses.get(tag['id'], [])} for tag in tags]

    def source_status(self):
        result = []
        for source in self.sources():
            driver = self.drivers.get(source['id'])
            try:
                status = driver.status() if driver else {'quality': 'bad', 'message': self.source_errors.get(source['id'], 'Disconnected')}
            except Exception as error:
                status = {'quality': 'bad', 'message': str(error)}
            result.append({'id': source['id'], 'status': status})
        return result

    def source_diagnostics(self):
        tags = self.tags()
        result = []
        for source in self.sources():
            driver = self.drivers.get(source['id'])
            try:
                status = driver.status() if driver else {'quality': 'bad', 'message': self.source_errors.get(source['id'], 'Disconnected')}
            except Exception as error:
                status = {'quality': 'bad', 'message': str(error)}
            result.append({**source, 'status': status, 'tags': [t['id'] for t in tags if t['source'] == source['id']]})
        return result

    def source_catalog(self):
        with self.lock:
            tags, sources, pages = self.tags(), self.sources(), self.pages()
        uses = self.reference_index(tags, sources, pages)
        by_source = {}
        for tag in tags:
            by_source.setdefault(tag['source'], []).append(tag)
        result = []
        for source in sources:
            related = by_source.get(source['id'], [])
            driver = self.drivers.get(source['id'])
            try:
                status = driver.status() if driver else {'quality': 'bad', 'message': self.source_errors.get(source['id'], 'Disconnected')}
            except Exception as exc:
                status = {'quality': 'bad', 'message': str(exc)}
            result.append({**source, 'status': status, 'tags': [tag['id'] for tag in related],
                           'usage': [use for tag in related for use in uses.get(tag['id'], [])]})
        return result

    def remove_tag(self, data):
        if any(t['id']==data['id'] and t.get('builtin') for t in self.tags()):raise ValueError('Built-in tags cannot be removed')
        with self.lock:
            if self.usage(data['id']):
                raise ValueError('Tag is used by a saved page or sheet formula. Remove those references first.')
            self.store.set('tags', [t for t in self.store.get('tags',[]) if t['id'] != data['id']])
            self.configure_polling()

    def remove_source(self, data):
        if data['id']=='simulation':raise ValueError('Manage Simulation in Administration')
        if data['id']=='system':raise ValueError('System is built in and cannot be removed')
        with self.lock:
            related = [t for t in self.tags() if t['source'] == data['id']]
            if any(use.get('source') != data['id'] for tag in related for use in self.usage(tag['id'])):
                raise ValueError('Source tags are used by saved pages or another sheet. Remove those references first.')
            driver = self.drivers.get(data['id'])
            self.store.set('tags', [t for t in self.store.get('tags',[]) if t['source'] != data['id']])
            self.store.set('sources', [s for s in self.sources() if s['id'] != data['id']])
            self.drivers.pop(data['id'], None)
            self.configure_polling()
        if driver:
            driver.close()

    def simulation_config(self):
        source=next((s for s in self.sources() if s['kind']=='simulation'),None)
        return simulation_settings(source['settings'] if source else {})

    def configure_simulation(self, data):
        settings=simulation_settings(data)
        with self.lock:
            sources=self.sources()
            if any(s['id']!='simulation' and s.get('name',s['id']).casefold()=='simulation' for s in sources):
                raise ValueError('Rename the existing Simulation source first')
            if any(s['id']=='simulation' and s['kind']!='simulation' for s in sources):
                raise ValueError('The Simulation source identity is already in use')
            # A new model invalidates cached samples and gives settings changes a clean start.
            driver=SimulationDriver(settings)
            source={'id':'simulation','name':'Simulation','kind':'simulation','settings':settings}
            self.store.set('sources',[s for s in sources if s['id']!='simulation']+[source])
            self.drivers['simulation']=driver
            self.configure_polling()
            for tag in self.simulation_tags:
                sample=driver.read_many([tag['address']])[tag['address']]
                with self.polling.lock:self.polling.cache[tag['id']]={**sample,'timestamp':time.time()}
            self.evaluate_alarms()
        return settings

    def sources(self):
        sources=self.store.get('sources',[])
        return [s for s in sources if s['kind']!='system']+[s for s in sources if s['kind']=='system']

    def tags(self):
        return self.store.get('tags', [])+system_tags()+self.connection_tags+getattr(self,'simulation_tags',[])

    def add_source(self, data):
        with self.lock:
            sources = self.sources()
            name = str(data.get('name', data.get('id', ''))).strip()
            identity = str(data.get('id') or uuid.uuid4().hex)
            kind = data['kind']
            if kind=='simulation':raise ValueError('Manage Simulation in Administration')
            if kind=='system':raise ValueError('System is built in; add Memory tags to it instead')
            if not name or any(s.get('name', s['id']).casefold() == name.casefold() for s in sources):
                raise ValueError('Source name is empty or already exists')
            if kind not in DRIVERS:
                raise ValueError('Unknown driver')
            if any(s['id'] == identity for s in sources):
                raise ValueError('Source identity already exists')
            source = {'id': identity, 'name': name, 'kind': kind, 'settings': data.get('settings', {})}
            if kind == 'database':
                source['settings']=database_settings(source['settings'])
                if any(s['kind']=='database' and s['settings']['filename'].casefold()==source['settings']['filename'].casefold() for s in sources):raise ValueError('This database file already has a source')
            if kind == 'modbus':
                source['settings'] = modbus_settings(source['settings'])
            if kind == 'mqtt':
                source['settings'] = mqtt_settings(source['settings'])
            if kind == 'sheet':
                source['settings'] = sheet_settings(source['settings'])
                self.check_sheet_filename(source['settings']['filename'])
            if kind in ('pycomm3', 'bacnet'):
                source['settings'] = (bacnet_settings if kind == 'bacnet' else connection_settings)(source['settings'])
                receipt = self.test_receipts.get(data.get('test_token'))
                source['tested_at'] = receipt[1] if receipt and receipt[0] == source['settings'] and time.time() - receipt[1] < 1800 else None
            driver = DRIVERS[kind](source['settings'])
            if isinstance(driver,DatabaseDriver):driver.bind(Path(self.store.path).parent/'databases')
            if isinstance(driver, SheetDriver):
                driver.bind(Path(self.store.path).parent / 'sheets', lambda: self.sheet_snapshot()[identity], self.recalculate_sheets, self.sheet_lock)
            self.store.set('sources', sources + [source])
            self.drivers[identity] = driver
            self.configure_polling()

    def edit_source(self, data):
        if data['id']=='simulation':raise ValueError('Manage Simulation in Administration')
        if data['id']=='system':raise ValueError('System settings are built in')
        old_driver = None
        with self.lock:
            sources = self.sources()
            source = next((s for s in sources if s['id'] == data['id']), None)
            if source is None:
                raise ValueError('Unknown source')
            name = str(data.get('name', source.get('name', source['id']))).strip()
            if not name or any(s['id'] != source['id'] and s.get('name', s['id']).casefold() == name.casefold() for s in sources):
                raise ValueError('Source name is empty or already exists')
            settings = data.get('settings', source['settings'])
            if source['kind']=='database':
                settings=database_settings(settings)
                if settings['filename']!=source['settings']['filename']:raise ValueError('Create a new source to select another database file')
            if source['kind'] == 'sheet':
                settings = sheet_settings(settings)
                self.check_sheet_filename(settings['filename'], source['id'])
            if source['kind'] == 'modbus':
                settings = modbus_settings(settings)
            if source['kind'] == 'mqtt':
                settings = mqtt_settings(settings)
            if source['kind'] == 'bacnet':
                settings = bacnet_settings(settings)
            if source['kind'] == 'pycomm3':
                settings = connection_settings(settings)
            previous = source['settings']
            if previous.get('protocol', 'logix') != settings.get('protocol', 'logix') and any(t['source'] == source['id'] and not t.get('builtin') for t in self.tags()):
                raise ValueError('Remove this source’s tags before changing its protocol type')
            connection_changed = (source['kind'] == 'mqtt' and settings != previous) or (source['kind'] == 'modbus' and any(previous.get(k) != settings.get(k) for k in settings if k not in ('live','background'))) or any(previous.get(k) != settings.get(k) for k in ('path', 'plc_type', 'timeout', 'local_ip', 'protocol', 'prefix', 'port', 'device_id', 'bbmd_address', 'bbmd_ttl', 'target', 'discovery_min', 'discovery_max', 'use_cov', 'cov_lifetime', 'cov_verify', 'cov_confirmed'))
            current_driver = self.drivers.get(source['id'])
            if connection_changed or current_driver is None:
                if source['kind']=='modbus' and getattr(current_driver,'bus',None) is not None:
                    driver = current_driver.replacement(settings)
                else:
                    driver = DRIVERS[source['kind']](settings)
                old_driver = current_driver
                self.drivers[source['id']] = driver
            elif source['kind'] == 'sheet':
                current_driver.rename_file(settings)
            elif source['kind'] in ('pycomm3', 'bacnet', 'modbus'):
                # Rates belong to the scheduler; retain the connected driver.
                current_driver.settings = dict(settings)
            source['name'] = name
            source['settings'] = settings
            if source['kind'] in ('pycomm3', 'bacnet'):
                receipt = self.test_receipts.get(data.get('test_token'))
                if receipt and receipt[0] == settings and time.time() - receipt[1] < 1800:
                    source['tested_at'] = receipt[1]
                elif connection_changed:
                    source['tested_at'] = None
            self.store.set('sources', sources)
            self.source_errors.pop(source['id'], None)
            self.configure_polling()
        if old_driver:
            old_driver.close()

    def edit_tag(self, data):
        # Keep identities stable so existing pages and editor drafts stay bound.
        with self.lock:
            original = next((t for t in self.tags() if t['id'] == data['id']), None)
            if original is None:
                raise ValueError('Unknown tag')
            if original.get('builtin'):raise ValueError('Built-in tags cannot be edited')
            source = next(s for s in self.sources() if s['id'] == original['source'])
            driver = self.drivers.get(source['id'])
        if driver is None:
            raise ValueError('Source unavailable')
        address = original['address'] if source['kind'] in ('memory','system','database', 'pycomm3', 'bacnet', 'sheet') else str(data.get('address', original['address'])).strip()
        if source['kind'] == 'mqtt':
            address = topic_name(address)
        if not address:
            raise ValueError('Address is required')
        if source['kind'] == 'modbus':address = canonical_address(address)
        metadata = driver.describe(address) if source['kind'] in ('pycomm3', 'bacnet', 'modbus') else None
        name = str(data.get('name', original.get('name', original['id']))).strip()
        rename_allowed = source['kind'] in ('memory','system','database', 'bacnet', 'mqtt', 'modbus') or source['settings'].get('protocol') == 'slc'
        if not rename_allowed and name != original.get('name', original['id']):
            raise ValueError('This tag type has a fixed name')
        if not name:
            raise ValueError('Tag name is required')
        with self.lock:
            tags = self.tags()
            tag = next((t for t in tags if t['id'] == data['id']), None)
            if tag is None or tag != original or self.drivers.get(source['id']) is not driver:
                raise ValueError('Tag or source changed; reopen Edit')
            if any(t['id'] != tag['id'] and t['source'] == tag['source'] and t['address'] == address for t in tags):
                raise ValueError('This address is already added for this source')
            if any(t['id'] != tag['id'] and t['source'] == tag['source'] and t.get('folder')==tag.get('folder') and t.get('name', t['id']).casefold() == name.casefold() for t in tags):
                raise ValueError('Tag name already exists in this source')
            tag.update(name=name, address=address)
            tag['writable'] = True  # Compatibility field only; never used to authorize writes.
            if metadata:
                tag.update(reported_access='Read/Write' if metadata['writable'] else 'Read only', data_type=metadata['type'])
            if source['kind'] == 'bacnet':
                tag.update(bacnet_path=metadata['bacnet_path'], property=metadata['property'])
            self.store.set('tags', [t for t in tags if not t.get('builtin')])
            self.configure_polling()

    def add_tag(self, data):
        source = next((s for s in self.sources() if s['id'] == data['source']), None)
        if source is None:
            raise ValueError('Unknown source')
        if source['kind']=='simulation':raise ValueError('Simulation tags are built in')
        metadata = None
        if source and source['kind'] in ('pycomm3', 'bacnet', 'modbus'):
            driver = self.drivers.get(data['source'])
            if driver is None:
                raise ValueError('Source unavailable')
            metadata = driver.describe(str(data['address']).strip())
        with self.lock:
            tags = self.store.get('tags',[])
            name = str(data.get('name', data.get('id', ''))).strip()
            if source and source['kind'] == 'pycomm3' and source['settings'].get('protocol', 'logix') == 'logix' and 'name' in data:
                name = str(data['address']).strip().removeprefix('Program:')
            if source and source['kind'] == 'bacnet' and not name:
                raise ValueError('Tag name is required')
            if not name or (any(t['source'] == data['source'] and t.get('name', t['id']).casefold() == name.casefold() for t in self.tags())):
                raise ValueError('Tag name is empty or already exists in this source')
            if source and source['kind'] == 'sheet':
                name = cell_address(data['address'])
            identity = str(data.get('id') or uuid.uuid4().hex)
            if any(t['id'] == identity for t in self.tags()):
                identity = uuid.uuid4().hex
            if data['source'] not in self.drivers:
                raise ValueError('Unknown source')
            address = ('Memory/'+identity if source['kind']=='system' else identity) if source['kind'] in ('memory','system','database') else str(data['address']).strip()
            if source and source['kind'] == 'sheet':
                address = cell_address(address)
                if address not in CELLS:
                    raise ValueError('Choose a cell within A1:D15')
            if source['kind'] == 'modbus':
                address = canonical_address(address)
            if source['kind'] == 'mqtt':
                address = topic_name(address)
            if not address:
                raise ValueError('Address is required')
            if any(t['source'] == data['source'] and t['address'] == address for t in tags):
                raise ValueError('This PLC address is already added for this source')
            tag = {'id': identity, 'name': name, 'source': data['source'], 'address': address, 'writable': True}
            if source['kind']=='system':tag['folder']='Memory'
            source = next(s for s in self.sources() if s['id'] == data['source'])
            if source['kind'] == 'sheet':
                tag['name'] = address
            if source['kind'] in ('pycomm3', 'modbus'):
                tag.update(reported_access='Read/Write' if metadata['writable'] else 'Read only',
                           data_type=metadata['type'])
            if source['kind'] == 'bacnet':
                tag.update(bacnet_path=metadata['bacnet_path'], property=metadata['property'], data_type=metadata['type'], reported_access='Read/Write' if metadata['writable'] else 'Read only')
            self.store.set('tags', tags + [tag])
            self.configure_polling()

    def values(self, tag_ids=None):
        with self.lock:
            result = {}
            cached = self.polling.samples(tag_ids)
            for tag in self.tags():
                if tag_ids is not None and tag['id'] not in tag_ids:
                    continue
                if tag['id'] in cached:
                    result[tag['id']] = cached[tag['id']]
                    continue
                try:
                    value = self.drivers[tag['source']].read(tag['address'])
                    if not self.polling.valid_value(value):
                        raise ValueError('Invalid value')
                    result[tag['id']] = {'value': value, 'quality': 'good', 'timestamp': time.time()}
                except Exception:
                    result[tag['id']] = {'value': None, 'quality': 'bad', 'timestamp': time.time()}
            return result

    def batch_values(self, data):
        requested = data.get('tags', [])
        page_ids = data.get('pages', [])
        if not isinstance(requested, list) or not isinstance(page_ids, list) or not all(isinstance(value, str) for value in requested + page_ids):
            raise ValueError('Tags and pages must be lists of IDs')
        source_id = data.get('source')
        with self.lock:
            source = next((source for source in self.sources() if source['id'] == source_id), None)
            if source_id is not None and source is None:
                raise ValueError('Unknown source')
            known = {tag['id'] for tag in self.tags() if source_id is None or tag['source'] == source_id}
            selected = set(requested) & known
            return {'values': self.values(selected), 'server_time': time.time(),
                    'live': source['settings'].get('live', 0.5) if source else 0.5}

    def act(self, data):
        with self.lock:
            tag = next((t for t in self.tags() if t['id'] == data['tag']), None)
            if not tag:
                raise ValueError('Unknown tag')
            if tag.get('builtin') and not simulation_writable(tag):raise ValueError('Built-in tags are read only')
            kind = data['action']
            operand = float(data.get('value', 1))
            if kind == 'value_input':
                validate_value_input(data, operand)
                kind = 'set'
            if kind not in ACTIONS:
                raise ValueError('Unknown action')
            action = ACTIONS[kind]
            driver = self.drivers[tag['source']]
            action_lock = self.action_locks.setdefault(tag['source'], threading.RLock())
        with action_lock:
            current = None if kind == 'set' else driver.read(tag['address'])
            value = action.handler(current, operand)
            if not math.isfinite(value):
                raise ValueError('Value must be finite')
            driver.write(tag['address'], value)
            self.polling.acknowledge_write(tag['id'])
            if isinstance(driver,(DRIVERS['system'],DatabaseDriver,SimulationDriver)):
                self.polling.update(tag['id'],driver.read(tag['address']))
            if isinstance(driver, (SheetDriver,DRIVERS['memory'],DRIVERS['system'],DatabaseDriver,SimulationDriver)):
                self.recalculate_sheets()
            return value
