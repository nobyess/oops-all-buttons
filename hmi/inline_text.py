"""Resolve literal inline display references; no evaluation or device writes."""
import re
from .tag_paths import tag_path

TOKENS = re.compile(r'@\{([^{}\r\n]+)\}')

def bind_inline_text(controls, tags, sources, parameters=()):
    names = {s['id']: s.get('name', s['id']) for s in sources}
    paths = {tag_path(t, names.get(t['source'], t['source'])).casefold(): t['id'] for t in tags}
    paths.update({('Parameters\\' + p['name']).casefold(): p['id'] for p in parameters})
    known = {t['id'] for t in tags} | {p['id'] for p in parameters}
    for control in controls:
        fields = [(control, 'text', 'textRefs')]
        fields += [(event, 'content', 'contentRefs') for event in control.get('events', []) if event.get('action') == 'set_content']
        for owner, field, refs_key in fields:
            previous = owner.get(refs_key, {})
            refs = {}
            for path in TOKENS.findall(str(owner.get(field, ''))):
                identity = previous.get(path)
                if identity not in known:
                    identity = paths.get(path.casefold())
                if identity:
                    refs[path] = identity
            if refs:
                owner[refs_key] = refs
            else:
                owner.pop(refs_key, None)

def inline_ids(control):
    result = set(control.get('textRefs', {}).values())
    for event in control.get('events', []):
        if event.get('action') == 'set_content':
            result.update(event.get('contentRefs', {}).values())
    return result
