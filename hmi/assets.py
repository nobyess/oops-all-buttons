"""Project assets: small catalogs, immutable on-disk blobs, stable references."""
import base64
import hashlib
import json
import re
import secrets
from pathlib import Path
from urllib.parse import urlsplit
from .images import prepare_image, MAX_IMAGE_BYTES
from .builtin_assets import BuiltinAssets, authoring_enabled, atomic_write
from .symbols import prepare_symbol

KINDS = {'image', 'movie', 'symbol', 'text'}
MAX_MOVIE_BYTES = 25 * 1024 * 1024
ID = re.compile(r'[a-f0-9]{64}')


def asset_identity(url):
    path = urlsplit(str(url)).path
    match = re.fullmatch(r'/api/(?:images|symbols)/([a-f0-9]{64})', path)
    if not match:
        match = re.fullmatch(r'/api/assets/([a-f0-9]{64})/content', path)
    return match[1] if match else None


class AssetCenter:
    def __init__(self, service):
        self.service = service
        self.store = service.store
        self.directory = Path(self.store.path).parent / 'assets'
        self.builtins = Path(__file__).resolve().parents[1] / 'static' / 'symbols'
        self.builtin_assets = BuiltinAssets(self.builtins.parent / 'assets')

    def records(self):
        return self.store.get('assets', [])

    def get(self, identity):
        return next((item for item in self.records() if item['id'] == identity), None)

    def blob_path(self, item):
        if not ID.fullmatch(str(item.get('blob', ''))):
            raise ValueError('Invalid asset file')
        path = self.directory / item['blob']
        if path.is_symlink():
            raise ValueError('Invalid asset file')
        return path

    def public(self, item):
        return {key: value for key, value in item.items() if key not in ('blob','builtin_blob','builtin_source')} | {
            'url': ('/api/images/' + item['id'] if item['kind'] in ('image', 'symbol') else '/api/assets/' + item['id'] + '/content') + '?v=' + str(item['revision'])}

    def reference_index(self):
        result = {}
        for page in self.service.pages():
            for control in page.get('controls', []):
                identity = asset_identity(control.get('image', ''))
                if identity:
                    result.setdefault(identity, []).append({'page': page['id'], 'control': control['id'], 'name': page.get('name', page['id']) + '\\' + control.get('name', control['id'])})
        logo = self.store.get('site_logo_asset')
        if logo:
            result.setdefault(logo, []).append({'name': 'Site\\Login Logo'})
        return result

    def references(self, identity):
        return self.reference_index().get(identity, [])

    def catalog(self, builtins=False, include_copied=False):
        with self.service.lock:
            self.adopt_legacy()
            references=self.reference_index()
            result = [self.public(item) | {'references': references.get(item['id'],[])} for item in self.records()]
            if builtins:
                catalog = json.loads((self.builtins / 'index.json').read_text(encoding='utf-8'))
                copied={item.get('builtin_source') for item in self.records() if item.get('builtin_blob')==item['blob']}
                for item in catalog['symbols']:
                    if re.fullmatch(r'assets/[A-Za-z0-9_-]+\.svg', item['file']):
                        source_hash=hashlib.sha256((self.builtins/item['file']).read_bytes()).hexdigest()
                        if not include_copied and item['id']+':'+source_hash in copied:continue
                        result.append({'id': 'builtin:' + item['id'], 'name': item['name'], 'category': item['category'], 'filename': item['source_name'], 'kind': 'symbol', 'builtin': True, 'url': '/symbols/' + item['file'], 'size': (self.builtins / item['file']).stat().st_size, 'references': []})
                for item in self.builtin_assets.catalog():
                    if include_copied or item['id'].removeprefix('builtin:')+':'+item['sha256'] not in copied:result.append(item)
            return sorted(result, key=lambda item: (item['category'].casefold(), item['name'].casefold()))

    def adopt_legacy(self):
        """Index existing uploaded images without changing their saved URLs."""
        logo=self.store.get('site_logo')
        if not self.store.get('site_logo_asset') and logo and ID.fullmatch(str(logo.get('id',''))):
            self.store.set_many({'image:'+logo['id']:logo,'site_logo_asset':logo['id']})
        items = self.records()
        known = {item['id'] for item in items}
        with self.store.connect() as db:
            keys = [row[0] for row in db.execute("SELECT key FROM config WHERE key LIKE 'image:%'")]
        changed = False
        for key in keys:
            identity = key[6:]
            if identity in known or not ID.fullmatch(identity):
                continue
            asset = self.store.get(key)
            raw = base64.b64decode(asset['data'])
            self.directory.mkdir(parents=True, exist_ok=True)
            blob = hashlib.sha256(raw).hexdigest()
            (self.directory / blob).write_bytes(raw)
            item = {'id': identity, 'blob': blob, 'name': asset.get('name', 'Image'), 'filename': asset.get('name', 'Image'), 'kind': 'symbol' if asset.get('symbol') else 'image', 'category': 'Imported', 'mime': asset['mime'], 'size': len(raw), 'revision': 1}
            items.append(item)
            if asset.get('symbol'):
                self.store.set('asset-symbol:' + identity, asset['symbol'])
            known.add(identity)
            changed = True
        if changed:
            self.store.set('assets', items)

    def save(self, data):
        with self.service.lock:
            self.adopt_legacy()
            items = self.records()
            previous = self.get(data.get('id')) if data.get('id') else None
            if data.get('id') and not previous:
                raise ValueError('Asset not found')
            kind = previous['kind'] if previous else data.get('kind')
            if kind not in KINDS:
                raise ValueError('Choose an asset type')
            name = data.get('name', previous['name'] if previous else '')
            category = data.get('category', previous['category'] if previous else 'General')
            if not isinstance(name, str) or not name.strip() or len(name) > 200:
                raise ValueError('Enter an asset name of up to 200 characters')
            if not isinstance(category, str) or not category.strip() or len(category) > 100:
                raise ValueError('Enter a category of up to 100 characters')
            item = dict(previous) if previous else {'id': secrets.token_hex(32), 'kind': kind, 'revision': 0}
            item.update(name=name.strip(), category=category.strip())
            tree = None
            if 'data' in data:
                try:
                    raw = base64.b64decode(data['data'], validate=True)
                except (ValueError, TypeError):
                    raise ValueError('Invalid asset encoding') from None
                limit = MAX_MOVIE_BYTES if kind == 'movie' else MAX_IMAGE_BYTES
                if not raw or len(raw) > limit:
                    raise ValueError('Asset is empty or exceeds the ' + str(limit // 1048576) + ' MiB limit')
                filename = str(data.get('filename', name)).replace('\\', '/').rsplit('/', 1)[-1][:200]
                if kind in ('image', 'symbol'):
                    prepared = (prepare_symbol if kind == 'symbol' else prepare_image)({'name': filename, 'data': data['data']})
                    raw = base64.b64decode(prepared['data'])
                    mime = prepared['mime']
                    tree = prepared.get('symbol')
                elif kind == 'movie':
                    if raw[4:8] == b'ftyp' and Path(filename).suffix.lower() in ('.mp4', '.m4v'):
                        mime = 'video/mp4'
                    elif raw.startswith(b'\x1aE\xdf\xa3') and filename.lower().endswith('.webm'):
                        mime = 'video/webm'
                    else:
                        raise ValueError('Choose an MP4 or WebM movie')
                else:
                    if Path(filename).suffix.lower() not in ('.txt', '.md', '.csv', '.json'):
                        raise ValueError('Choose a TXT, MD, CSV or JSON text file')
                    try:
                        text = raw.decode('utf-8-sig')
                    except UnicodeError:
                        raise ValueError('Text files must use UTF-8') from None
                    if '\x00' in text:
                        raise ValueError('Binary content is not a text asset')
                    mime = 'text/plain; charset=utf-8'
                blob = hashlib.sha256(raw).hexdigest()
                self.directory.mkdir(parents=True, exist_ok=True)
                path = self.directory / blob
                if not path.exists():
                    temporary = self.directory / (blob + '.' + secrets.token_hex(4) + '.tmp')
                    temporary.write_bytes(raw)
                    temporary.replace(path)
                item.update(blob=blob, mime=mime, filename=filename, size=len(raw))
            elif not previous:
                raise ValueError('Choose a file')
            item['revision'] += 1
            changes={'assets':[item if other['id'] == item['id'] else other for other in items] if previous else items + [item]}
            if tree:
                changes['asset-symbol:' + item['id']]=tree
            # Refresh saved control URLs after replacement, avoiding stale browser caches.
            pages = self.service.pages()
            changed = False
            for page in pages:
                for control in page.get('controls', []):
                    if asset_identity(control.get('image', '')) == item['id']:
                        control.update(image=self.public(item)['url'], imageName=item['name'])
                        if control.get('type')=='textviewer':control['textMarkdown']=item['filename'].lower().endswith('.md')
                        changed = True
            if changed:
                changes['pages']=pages
            self.store.set_many(changes)
            if previous and previous['blob'] != item['blob']:
                self.cleanup_blob(previous['blob'])
            return self.public(item)

    def import_builtin(self, identity):
        if not isinstance(identity,str):raise ValueError('Built-in asset not found')
        if identity.startswith('builtin:asset:'):
            item,raw=self.builtin_assets.read(identity)
            source='asset:'+item['id']+':'+hashlib.sha256(raw).hexdigest()
            kind=item['kind'];filename=item['filename']
        else:
            catalog=json.loads((self.builtins/'index.json').read_text(encoding='utf-8'))
            item=next((item for item in catalog['symbols'] if 'builtin:'+item['id']==identity),None)
            if not item or not re.fullmatch(r'assets/[A-Za-z0-9_-]+\.svg',item['file']):raise ValueError('Built-in symbol not found')
            raw=(self.builtins/item['file']).read_bytes()
            source=item['id']+':'+hashlib.sha256(raw).hexdigest();kind='symbol';filename=item['name']+'.svg'
        with self.service.lock:
            existing=next((entry for entry in self.records() if entry.get('builtin_source')==source and entry.get('builtin_blob')==entry['blob']),None)
            if existing:return self.public(existing)
            result=self.save({'name':item['name'],'category':item['category'],'kind':kind,'filename':filename,'data':base64.b64encode(raw).decode('ascii')})
            self.mark_builtin(result['id'],source)
            return result

    def mark_builtin(self, identity, source):
        records=self.records()
        for entry in records:
            if entry['id']==identity:entry.update(builtin_source=source,builtin_blob=entry['blob'])
        self.store.set('assets',records)

    def promote(self,data):
        if not authoring_enabled():raise ValueError('Built-in authoring is disabled in portable builds')
        with self.service.lock:
            current=self.get(data.get('id'))
            if not current:raise ValueError('Asset not found')
            asset=dict(current)
            for field,maximum in [('name',200),('category',100)]:
                value=data.get(field,current[field])
                if not isinstance(value,str) or not value.strip() or len(value)>maximum:raise ValueError('Enter a valid '+field)
                asset[field]=value.strip()
            raw=self.blob_path(current).read_bytes();digest=hashlib.sha256(raw).hexdigest()
            target=data.get('target') or None
            if target and not isinstance(target,str):raise ValueError('Choose a built-in destination')
            if target and not target.startswith('builtin:asset:'):
                if asset['kind']!='symbol':raise ValueError('Built-in asset type must match')
                catalog=json.loads((self.builtins/'index.json').read_text(encoding='utf-8'))
                entry=next((item for item in catalog['symbols'] if 'builtin:'+item['id']==target),None)
                if not entry:raise ValueError('Built-in symbol not found')
                filename='assets/'+digest+'.svg'
                atomic_write(self.builtins/filename,raw)
                entry.update(name=asset['name'],category=asset['category'],file=filename)
                atomic_write(self.builtins/'index.json',(json.dumps(catalog,indent=2,ensure_ascii=False)+'\n').encode('utf-8'))
                self.mark_builtin(current['id'],entry['id']+':'+digest)
                return {'id':target,'name':entry['name'],'reused':False}
            if not target and current.get('builtin_source') and current.get('builtin_blob')==current['blob']:
                return {'name':current['name'],'reused':True}
            result=self.builtin_assets.promote(asset,raw,target)
            source=result['id'].removeprefix('builtin:')+':'+result['sha256']
            self.mark_builtin(current['id'],source)
            return result

    def image(self, identity):
        item = self.get(identity)
        if item and item['kind'] in ('image', 'symbol'):
            if not self.blob_path(item).is_file():return None
            result = {'id': identity, 'name': item['name'], 'mime': item['mime'], 'data': base64.b64encode(self.blob_path(item).read_bytes()).decode('ascii')}
            if item['kind'] == 'symbol':
                result['symbol'] = self.store.get('asset-symbol:' + identity)
            return result
        return self.store.get('image:' + identity)

    def cleanup_blob(self, blob):
        if not any(item['blob'] == blob for item in self.records()) and ID.fullmatch(blob):
            (self.directory / blob).unlink(missing_ok=True)

    def remove(self, identity):
        with self.service.lock:
            item = self.get(identity)
            if not item:
                raise ValueError('Asset not found')
            if self.references(identity):
                raise ValueError('Remove saved page or site references before deleting this asset')
            self.store.set('assets', [other for other in self.records() if other['id'] != identity])
            with self.store.connect() as db:
                db.execute('DELETE FROM config WHERE key IN (?,?)', ('image:' + identity, 'asset-symbol:' + identity))
            self.cleanup_blob(item['blob'])
            return {'ok': True}
