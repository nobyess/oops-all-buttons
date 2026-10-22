"""Pinned upstream source and corresponding application source for portable builds."""
import hashlib
import json
import tarfile
import urllib.request
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

REQUIRED = {'bac0', 'pystray', 'formulas', 'schedula', 'tqdm'}
PRIVATE = {'symbol_library_manager.py', 'manage-symbols.cmd', 'requirements-symbol-manager.txt', 'hmi/symbol_library.py', 'tests/test_symbol_library.py'}

def checked_source(root, identity, version, reference):
    if not reference or reference.get('version') != version:
        raise ValueError('Review and pin corresponding source for '+identity+' '+version)
    filename = reference['filename']
    if Path(filename).name != filename or not filename.endswith('.tar.gz'):
        raise ValueError('Invalid source archive name')
    target = Path(root)/'third-party'/'sources'/filename
    target.parent.mkdir(parents=True, exist_ok=True)
    expected = reference['sha256']
    if target.exists():
        if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
            raise ValueError('Source archive checksum mismatch: '+filename)
    else:
        url = reference['url']
        if not url.startswith(('https://files.pythonhosted.org/', 'https://codeload.github.com/')):
            raise ValueError('Unreviewed source archive host')
        with urllib.request.urlopen(url, timeout=90) as response:
            data = response.read(50*1024*1024+1)
        if len(data)>50*1024*1024 or hashlib.sha256(data).hexdigest()!=expected:
            raise ValueError('Source archive checksum mismatch: '+filename)
        target.write_bytes(data)
    return target

def verify_library_source(distribution, archive):
    """Check the shipped Python modules against the pinned upstream source.

    Do not extract archives or execute upstream build scripts. A local library
    edit stops packaging until matching source is supplied and reviewed.
    """
    checked = 0
    with tarfile.open(archive, 'r:gz') as source:
        members = [m for m in source.getmembers() if m.isfile() and m.name.endswith('.py')]
        for relative in distribution.files or []:
            relative = Path(relative)
            if relative.suffix != '.py' or '..' in relative.parts or any(p.endswith(('.dist-info','.data')) for p in relative.parts):
                continue
            installed = Path(distribution.locate_file(relative))
            if not installed.is_file(): continue
            suffix = '/'+relative.as_posix().casefold()
            matches = [m for m in members if ('/'+m.name.casefold()).endswith(suffix)]
            if len(matches)!=1:
                raise ValueError('Cannot verify upstream source for '+str(relative))
            original = source.extractfile(matches[0]).read().replace(b'\r\n',b'\n')
            if installed.read_bytes().replace(b'\r\n',b'\n') != original:
                raise ValueError('Modified library needs matching corresponding source: '+str(relative))
            checked += 1
    if not checked: raise ValueError('No library source verified: '+str(archive))
    return checked

def application_source(root, destination):
    root, destination = Path(root), Path(destination)
    files = [p for p in root.iterdir() if p.is_file() and (p.suffix in ('.py','.md') or p.name.startswith('requirements') and p.suffix=='.txt' or p.name in ('LICENSE','.gitignore'))]
    for name in ('hmi','static','tools','packaging','docs','.github'):
        files.extend(p for p in (root/name).rglob('*') if p.is_file())
    # License inputs and rebuild instructions are needed by a fresh source build.
    for name in ('README.md','REBUILD.md','upstream-references.json'):
        if (root/'third-party'/name).is_file():files.append(root/'third-party'/name)
    for name in ('runtime-licenses','license-supplements'):
        files.extend(p for p in (root/'third-party'/name).rglob('*') if p.is_file())
    with ZipFile(destination,'w',ZIP_DEFLATED) as zipped:
        for path in sorted(set(files)):
            relative=path.relative_to(root)
            if relative.as_posix() in PRIVATE or '__pycache__' in relative.parts or path.suffix in ('.pyc','.sqlite3','.oab-backup'):
                continue
            zipped.write(path,Path('python-hmi')/relative)
    return hashlib.sha256(destination.read_bytes()).hexdigest()
