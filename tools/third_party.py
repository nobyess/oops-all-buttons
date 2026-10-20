"""Collect licenses for distributions actually selected by PyInstaller.

Collect notices and inventory only. Source-distribution requirements remain
pending maintainer review; no source archives are downloaded or bundled.
"""
import ast
import importlib.metadata as metadata
import json
import re
import shutil
import sys
from pathlib import Path


def canonical(name):
    return re.sub(r'[-_.]+', '-', name).lower()


def bundled_paths(directory):
    paths = set()
    def visit(value):
        if isinstance(value, str) and 'site-packages' in value.lower():
            paths.add(str(Path(value).resolve()).casefold())
        elif isinstance(value, (tuple, list)):
            for child in value: visit(child)
    for path in Path(directory).glob('*.toc'):
        visit(ast.literal_eval(path.read_text(encoding='utf-8')))
    if not paths: raise ValueError('No PyInstaller dependency inventory found')
    return paths


def license_file(path):
    name = Path(path).name.lower()
    return any(name.startswith(prefix) for prefix in ('license', 'licence', 'copying', 'notice', 'authors', 'copyright'))


def safe_relative(value):
    return Path(*[part.replace(':', '_') for part in str(value).replace('\\', '/').split('/') if part not in ('', '.', '..')])


def include_licenses(bundle, root, analysis):
    bundle, root = Path(bundle), Path(root)
    target = bundle/'third-party'
    target.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root/'LICENSE', bundle/'LICENSE')
    shutil.copy2(root/'THIRD_PARTY_NOTICES.md', bundle/'THIRD_PARTY_NOTICES.md')
    (bundle/'docs').mkdir(exist_ok=True)
    shutil.copy2(root/'docs'/'LICENSE_REVIEW.md', bundle/'docs'/'LICENSE_REVIEW.md')
    shutil.copytree(root/'third-party', target, dirs_exist_ok=True, ignore=shutil.ignore_patterns('sources', '*.tar.gz', '*.tgz', 'application-source.zip', 'source-manifest.json'))
    manifest = json.loads((target/'upstream-references.json').read_text(encoding='utf-8'))
    paths = bundled_paths(analysis)
    inventory = []
    for distribution in sorted(metadata.distributions(), key=lambda d: d.metadata['Name'].lower()):
        files = distribution.files or []
        if not any(str(Path(distribution.locate_file(f)).resolve()).casefold() in paths for f in files): continue
        name = distribution.metadata['Name']
        identity = canonical(name)
        license_name = distribution.metadata.get('License-Expression') or distribution.metadata.get('License') or '; '.join(
            c for c in distribution.metadata.get_all('Classifier', []) if 'License ::' in c)
        if not license_name: raise ValueError('Review missing license metadata: '+name)
        source = manifest.get(identity)
        classification = distribution.metadata.get('License-Expression') or '; '.join(
            c for c in distribution.metadata.get_all('Classifier', []) if 'License ::' in c) or license_name.splitlines()[0]
        reciprocal = identity != 'pyinstaller' and any(key in classification.lower() for key in ('gpl', 'eupl', 'mpl'))
        destination = target/'licenses'/identity
        copied = []
        for relative in files:
            if not license_file(relative): continue
            original = Path(distribution.locate_file(relative))
            if not original.is_file(): continue
            # Keep relative paths without allowing metadata to escape the output.
            safe = safe_relative(relative)
            output = destination/safe
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(original, output)
            copied.append(str(output.relative_to(target)).replace('\\', '/'))
        supplement = target/'license-supplements'/f'{identity}-{distribution.version}'
        if not copied and supplement.is_dir():
            copied = [p.relative_to(target).as_posix() for p in supplement.iterdir() if p.is_file()]
        if not copied: raise ValueError('Review missing license texts: '+name)
        inventory.append({'name': name, 'version': distribution.version, 'license_metadata': license_name,
                          'license_files': copied, 'upstream_reference': source, 'source_distribution_review_pending': reciprocal,
                          'project_urls': distribution.metadata.get_all('Project-URL', [])})
    python_license = Path(sys.base_prefix)/'LICENSE.txt'
    if not python_license.is_file(): raise ValueError('Python runtime license is missing')
    shutil.copy2(python_license, target/'runtime-licenses'/'Python-LICENSE.txt')
    build_tools = {name: metadata.version(name) for name in ('pyinstaller', 'pyinstaller-hooks-contrib')
                   if any(canonical(d.metadata['Name']) == name for d in metadata.distributions())}
    (target/'inventory.json').write_text(json.dumps({'python': sys.version, 'packages': inventory, 'build_tools': build_tools, 'source_distribution_status': 'Pending maintainer review; source archives are not included'}, indent=2)+'\n', encoding='utf-8')
    constraints = '\n'.join(f"{p['name']}=={p['version']}" for p in inventory)
    (target/'build-versions.txt').write_text(constraints+'\n', encoding='utf-8')
    return inventory
