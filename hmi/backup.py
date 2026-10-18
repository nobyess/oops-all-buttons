"""Portable data backups. Restores are applied before drivers start."""
from contextlib import closing
import base64
import hashlib
import io
import json
import shutil
import sqlite3
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, BadZipFile

MAX_ARCHIVE = 64 * 1024 * 1024
MAX_DATA = 256 * 1024 * 1024

def pending_path(directory):
    directory = Path(directory)
    return directory.with_name(directory.name + '.restore.zip')

def _snapshot(source, target):
    with closing(sqlite3.connect(source)) as db, closing(sqlite3.connect(target)) as dest:
        db.backup(dest)

def export_backup(service):
    directory = Path(service.store.path).parent
    with service.lock, service.sheet_lock, tempfile.TemporaryDirectory() as temp:
        files = {'hmi.sqlite3': Path(temp)/'hmi.sqlite3'}
        _snapshot(service.store.path, files['hmi.sqlite3'])
        for folder in ('sheets', 'databases'):
            for source in sorted((directory/folder).glob('*')):
                if not source.is_file() or source.is_symlink():continue
                if folder == 'databases' and source.suffix.lower() not in ('.sqlite', '.sqlite3', '.db'):continue
                name = folder+'/'+source.name
                target = Path(temp)/folder/source.name
                target.parent.mkdir(exist_ok=True)
                if folder == 'databases':_snapshot(source, target)
                else:shutil.copyfile(source, target)
                files[name] = target
        manifest = {'format':'oops-all-buttons-backup','version':1,
                    'created_at':datetime.now(timezone.utc).isoformat(),
                    'files':{name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in files.items()}}
        if sum(p.stat().st_size for p in files.values()) > MAX_DATA:raise ValueError('Backup exceeds the 256 MiB data limit')
        output = io.BytesIO()
        with ZipFile(output,'w',ZIP_DEFLATED) as archive:
            archive.writestr('manifest.json',json.dumps(manifest))
            for name,path in files.items():archive.write(path,name)
        raw = output.getvalue()
        if len(raw)>MAX_ARCHIVE:raise ValueError('Backup exceeds the 64 MiB file limit')
        return {'filename':'oops-all-buttons-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'.oab-backup',
                'data':base64.b64encode(raw).decode('ascii')}

def _validate(raw, destination):
    try:
        if not raw or len(raw)>MAX_ARCHIVE:raise ValueError('Backup file is too large or empty')
        with ZipFile(io.BytesIO(raw)) as archive:
            entries=archive.infolist();names=[i.filename for i in entries]
            if len(entries)>10000 or len(names)!=len(set(names)) or sum(i.file_size for i in entries)>MAX_DATA:
                raise ValueError('Invalid backup size or duplicate files')
            if 'manifest.json' not in names or archive.getinfo('manifest.json').file_size>2_000_000:raise ValueError('Missing backup manifest')
            manifest=json.loads(archive.read('manifest.json'))
            if manifest.get('format')!='oops-all-buttons-backup' or manifest.get('version')!=1:raise ValueError('Unsupported backup format')
            files=manifest.get('files')
            if not isinstance(files,dict) or 'hmi.sqlite3' not in files or set(names)!=set(files)|{'manifest.json'}:raise ValueError('Incomplete backup')
            for name,digest in files.items():
                parts=name.split('/')
                if name!='hmi.sqlite3' and not (len(parts)==2 and parts[0] in ('sheets','databases')):raise ValueError('Invalid backup file path')
                if any(p in ('','.','..') or any(c in p for c in '\\:') for p in parts):raise ValueError('Invalid backup file path')
                content=archive.read(name)
                if hashlib.sha256(content).hexdigest()!=digest:raise ValueError('Backup checksum failed')
                target=destination.joinpath(*parts);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
            for path in [destination/'hmi.sqlite3',*(destination/'databases').glob('*')]:
                with closing(sqlite3.connect(path)) as db:
                    if db.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise ValueError('Damaged backup database')
            with closing(sqlite3.connect(destination/'hmi.sqlite3')) as db:
                config={key:json.loads(value) for key,value in db.execute('SELECT key,value FROM config')}
            users=config.get('users',[])
            if not isinstance(users,list) or not any(u.get('administrator') and not u.get('kiosk',False) for u in users):raise ValueError('Backup requires an administrator account outside Kiosk Mode')
            for key in ('pages','sources','tags'):
                if not isinstance(config.get(key),list):raise ValueError('Invalid backup configuration')
            return manifest
    except (BadZipFile,KeyError,TypeError,AttributeError,sqlite3.Error,UnicodeError,RuntimeError) as error:
        raise ValueError('Invalid or damaged backup file') from error

def stage_restore(directory, data):
    try:raw=base64.b64decode(data.get('data',''),validate=True)
    except (ValueError,TypeError) as error:raise ValueError('Invalid backup encoding') from error
    with tempfile.TemporaryDirectory() as temp:_validate(raw,Path(temp))
    pending=pending_path(directory);temporary=pending.with_suffix('.tmp')
    temporary.write_bytes(raw);temporary.replace(pending)
    return {'ok':True,'restart_required':True}

def apply_pending(directory):
    directory=Path(directory);pending=pending_path(directory)
    if not pending.exists():return
    with tempfile.TemporaryDirectory(dir=directory.parent,prefix='restore-') as temp:
        staged=Path(temp)/'data';staged.mkdir();_validate(pending.read_bytes(),staged)
        previous=directory.with_name(directory.name+'-before-restore-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:6])
        existed=directory.exists()
        if existed:directory.rename(previous)
        try:staged.rename(directory)
        except OSError:
            if existed:previous.rename(directory)
            raise
        pending.unlink()
