"""Version-controlled built-in assets; authoring is disabled in frozen builds."""
import hashlib
import json
import re
import secrets
import sys
from pathlib import Path


def authoring_enabled():
    return not bool(getattr(sys, 'frozen', False))


def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + secrets.token_hex(4) + '.tmp')
    try:
        temporary.write_bytes(content)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


class BuiltinAssets:
    def __init__(self, root):
        self.root = Path(root)

    def entries(self):
        index = self.root / 'index.json'
        if not index.exists():
            return []
        data = json.loads(index.read_text(encoding='utf-8'))
        if data.get('version') != 1 or not isinstance(data.get('assets'), list):
            raise ValueError('Invalid built-in asset catalog')
        for item in data['assets']:
            if not re.fullmatch(r'[a-f0-9]{32}', item['id']) or not re.fullmatch(r'files/[a-f0-9]{64}\.(svg|png|jpg|gif|webp|bmp|mp4|webm|txt|md|csv|json)', item['file']):
                raise ValueError('Invalid built-in asset path')
        return data['assets']

    def catalog(self):
        return [dict(item, id='builtin:asset:' + item['id'], builtin=True, url='/assets/' + item['file'], references=[]) for item in self.entries()]

    def read(self, identity):
        item = next((item for item in self.entries() if 'builtin:asset:' + item['id'] == identity), None)
        if not item:
            raise ValueError('Built-in asset not found')
        return item, (self.root / item['file']).read_bytes()

    def promote(self, asset, raw, target=None):
        if not authoring_enabled():
            raise ValueError('Built-in authoring is disabled in portable builds')
        entries = self.entries()
        existing = next((item for item in entries if 'builtin:asset:' + item['id'] == target), None) if target else None
        if target and not existing:
            raise ValueError('Built-in asset not found')
        if existing and existing['kind'] != asset['kind']:
            raise ValueError('Built-in asset type must match')
        digest = hashlib.sha256(raw).hexdigest()
        # Identical content is reused. Its existing identity and description win.
        identical = next((item for item in entries if item['kind'] == asset['kind'] and item['sha256'] == digest), None)
        if identical:
            if existing and existing['id']==identical['id']:
                identical.update(name=asset['name'],category=asset['category'])
                atomic_write(self.root/'index.json',(json.dumps({'version':1,'assets':entries},indent=2,ensure_ascii=False)+'\n').encode('utf-8'))
            return dict(identical, id='builtin:asset:' + identical['id'], reused=True)
        suffix = {'image/png':'png', 'image/jpeg':'jpg', 'image/gif':'gif', 'image/webp':'webp', 'image/bmp':'bmp', 'image/svg+xml':'svg', 'video/mp4':'mp4', 'video/webm':'webm'}.get(asset['mime'], Path(asset['filename']).suffix.lower().lstrip('.'))
        if suffix not in ('svg','png','jpg','gif','webp','bmp','mp4','webm','txt','md','csv','json'):
            raise ValueError('Unsupported built-in file type')
        item = {key: asset[key] for key in ('name','category','kind','mime','size','filename')}
        item.update(id=existing['id'] if existing else secrets.token_hex(16), file='files/' + digest + '.' + suffix, sha256=digest)
        atomic_write(self.root / item['file'], raw)
        updated = [item if entry['id'] == item['id'] else entry for entry in entries] if existing else entries + [item]
        atomic_write(self.root / 'index.json', (json.dumps({'version':1,'assets':updated}, indent=2, ensure_ascii=False) + '\n').encode('utf-8'))
        # Keep old immutable files: existing release/checkouts may still use them.
        return dict(item, id='builtin:asset:' + item['id'], reused=False)
