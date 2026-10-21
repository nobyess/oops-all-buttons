"""Portable page files: saved layouts plus named external bindings and images."""
import base64
import copy
import uuid
from .assets import asset_identity
from .tag_paths import tag_path
from .pages import validate_page
from .inline_text import bind_inline_text
from .images import prepare_image
from .symbols import prepare_symbol


def references(page):
    for owner in [page, *page.get('controls', []), *page.get('groups', [])]:
        if owner.get('binding', {}).get('tag'):
            yield owner['binding'], 'tag'
        if owner.get('type')=='trend':
            for series in owner.get('series',[]):
                if series.get('tag'):yield series,'tag'
        for key in ('textRefs', 'contentRefs'):
            for name in owner.get(key, {}):
                yield owner[key], name
        for rule in [*owner.get('actions', []), *owner.get('events', [])]:
            for key in ('tag', 'target'):
                if rule.get(key):
                    yield rule, key
            for key in ('operand', 'end_operand'):
                if rule.get(key, {}).get('kind') == 'tag':
                    yield rule[key], 'tag'
            for name in rule.get('contentRefs', {}):
                yield rule['contentRefs'], name
            for name in rule.get('parameters', {}):
                yield rule['parameters'], name


def export_page(service, data):
    with service.lock:
        page = next((p for p in service.pages() if p['id'] == data['id']), None)
        if page is None:
            raise ValueError('Unknown page')
        page = copy.deepcopy(page)
        names = {s['id']: s['name'] for s in service.sources()}
        tags = {tag['id']: tag_path(tag, names.get(tag['source'], tag['source'])) for tag in service.tags()}
        used = {owner[key] for owner, key in references(page)}
        destinations = {rule['page'] for owner in [page, *page['controls'], *page.get('groups', [])] for rule in owner.get('actions', []) if rule.get('action') in ('navigate', 'popup') and rule.get('page')}
        page_refs = {p['id']: {'name': p['name'], 'parameters': {parameter['id']: parameter['name'] for parameter in p.get('parameters', [])}}
                     for p in service.pages() if p['id'] in destinations}
        images = {}
        for control in page['controls']:
            image = control.get('image', '')
            if control.get('type')=='textviewer' and image:
                asset=service.assets.get(asset_identity(image))
                if not asset or asset['kind']!='text':raise ValueError('Page text asset is missing')
                images[image]={'kind':'text','name':asset['name'],'filename':asset['filename'],'category':asset['category'],'data':base64.b64encode(service.assets.blob_path(asset).read_bytes()).decode()}
            elif image.startswith('/api/images/'):
                asset = service.assets.image(asset_identity(image))
                if asset is None:
                    raise ValueError('Page image is missing')
                images[image] = {'name': asset.get('name', 'Image'), 'data': asset['data']}
        return {'format': 'python-hmi-page', 'version': 1, 'name': page['name'], 'page': page,
                'tags': {identity: tags[identity] for identity in used if identity in tags},
                'destinations': page_refs, 'images': images}


def import_page(service, data):
    payload = data.get('page', {})
    if not isinstance(payload, dict) or payload.get('format') != 'python-hmi-page' or payload.get('version') != 1:
        raise ValueError('Choose a Page JSON exported by this application')
    page = copy.deepcopy(payload.get('page'))
    if not isinstance(page, dict) or not isinstance(page.get('controls'), list):
        raise ValueError('Invalid page layout')
    name = str(data.get('name', payload.get('name', 'Imported Page'))).strip()
    if not name:
        raise ValueError('Page name is required')
    with service.lock:
        pages = service.pages()
        old_id = page.get('id')
        page['id'], page['name'] = uuid.uuid4().hex, name
        page.pop('usage', None)
        service.migrate_controls([page, *page['controls'], *page.get('groups', [])])
        validate_page(page)
        parameters = page.get('parameters', [])
        if not isinstance(parameters, list):
            raise ValueError('Invalid page parameters')
        local = {}
        for parameter in parameters:
            previous = parameter['id']
            if previous in local:
                raise ValueError('Duplicate parameter IDs')
            local[previous] = 'parameter:' + uuid.uuid4().hex
            parameter['id'] = local[previous]
        names = {s['id']: s['name'] for s in service.sources()}
        tags = {tag_path(tag, names.get(tag['source'], tag['source'])).casefold(): tag['id'] for tag in service.tags()}
        tag_manifest = payload.get('tags', {})
        if not isinstance(tag_manifest, dict):
            raise ValueError('Invalid tag manifest')
        mapped = dict(local)
        for owner, key in references(page):
            identity = owner[key]
            if not identity:
                continue
            if identity not in mapped:
                path = tag_manifest.get(identity)
                if not isinstance(path, str) or path.casefold() not in tags:
                    raise ValueError('Missing referenced tag: ' + str(path or identity))
                mapped[identity] = tags[path.casefold()]
            owner[key] = mapped[identity]
        destination_manifest = payload.get('destinations', {})
        group_ids = {group['id']: 'group_' + uuid.uuid4().hex for group in page.get('groups', [])}
        for owner in [page, *page['controls'], *page.get('groups', [])]:
            if owner is not page:
                owner['id'] = group_ids.get(owner['id']) or str(owner.get('type', 'control')) + '_' + uuid.uuid4().hex[:8]
                if owner.get('groupId'):
                    owner['groupId'] = group_ids[owner['groupId']]
            for rule in [*owner.get('actions', []), *owner.get('events', [])]:
                rule['id'] = uuid.uuid4().hex
                destination_id = rule.get('page') if rule.get('action') in ('navigate', 'popup') else None
                if not destination_id:
                    continue
                if destination_id == old_id:
                    destination = page
                    parameter_map = local
                else:
                    manifest = destination_manifest.get(destination_id, {})
                    candidates = [p for p in pages if p['name'] == manifest.get('name')]
                    if len(candidates) != 1:
                        raise ValueError('Missing or ambiguous destination page: ' + str(manifest.get('name', destination_id)))
                    destination = candidates[0]
                    parameter_names = {p['name']: p['id'] for p in destination.get('parameters', [])}
                    parameter_map = {identity: parameter_names.get(parameter_name) for identity, parameter_name in manifest.get('parameters', {}).items()}
                rule['page'] = destination['id']
                connections = rule.get('parameters', {})
                if any(key not in parameter_map or not parameter_map[key] for key in connections):
                    raise ValueError('Destination page parameters do not match the imported page')
                rule['parameters'] = {parameter_map[key]: value for key, value in connections.items()}
        validate_page(page)
        bind_inline_text([page, *page['controls'], *page.get('groups', [])], service.tags(), service.sources(), page['parameters'])
        service.validate_controls([{**c, 'actions': [], 'events': []} for c in page['controls']], strict_bindings=False)
        assets = {}
        for control in page['controls']:
            image = control.get('image', '')
            if image:
                raw = payload.get('images', {}).get(image)
                if not isinstance(raw, dict):
                    raise ValueError('Missing embedded page image')
                if control.get('type')=='textviewer':
                    if raw.get('kind')!='text':raise ValueError('Text Viewer requires a text asset')
                    asset=service.assets.save(raw)
                    control['image']=asset['url']
                    control['textMarkdown']=asset['filename'].lower().endswith('.md')
                    continue
                asset = (prepare_symbol if control.get('type')=='symbol' or (control.get('type')=='button' and control.get('buttonArtworkKind')=='symbol') else prepare_image)(raw)
                assets[asset['id']] = asset
                control['image'] = '/api/images/' + asset['id']
        for identity, asset in assets.items():
            service.store.set('image:' + identity, asset)
        service.store.set('pages', pages + [page])
        service.polling.changed.set()
        return {'id': page['id']}
