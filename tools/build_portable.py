"""Build a clean Windows portable folder and GitHub-ready release assets."""
import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import platform
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = {'PyInstaller': 'pyinstaller', 'BAC0': 'BAC0', 'bacpypes3': 'bacpypes3',
            'pycomm3': 'pycomm3', 'paho.mqtt': 'paho-mqtt', 'pymodbus': 'pymodbus',
            'serial': 'pyserial', 'formulas': 'formulas', 'ezdxf': 'ezdxf', 'pystray': 'pystray', 'PIL': 'Pillow'}
PORTABLE_README = '''Oops! All Buttons - Windows portable

Extract the entire ZIP to a writable folder, then double-click OopsAllButtons.exe.
The browser opens automatically and the tray offers Launch/Restart Server/Exit.
Python is included. Keep the files folder beside the executable.

Open http://127.0.0.1:8080 in your browser. Complete first-run setup or restore a backup.
Use Launch to open the app or Exit before closing/updating it.
If startup fails, a message is shown; details are in data/server.log.

Your project is stored in the data folder beside OopsAllButtons.exe.
For updates: stop the old server, back it up from Administration, extract the new
release into a new folder, and copy your data folder into it before starting.
If a restore is pending, copy data.restore.zip beside the data folder too.
Do not run both copies against the same device tags while updating.

Network access: create a shortcut with these arguments:
  OopsAllButtons.exe --host 0.0.0.0 --port 8080
Allow the server through the host firewall and visit http://<server-IP>:8080.
The default listens only on this computer; traffic uses HTTP.
Browser launch and the tray are enabled by default. Add --no-browser or --no-tray
to disable either. Use --kiosk for fullscreen browser launch.
'''


def release_version(value):
    value = value.removeprefix('v')
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?', value):
        raise ValueError('Use a version such as 0.1.0 or 0.1.0-beta.1')
    return value


def package_bundle(bundle, version, output):
    version = release_version(version)
    if not (bundle / 'OopsAllButtons.exe').is_file() or not (bundle / 'files' / 'static' / 'index.html').is_file():
        raise ValueError('The portable executable or bundled web assets are missing')
    # Never ship a project that was initialized during testing.
    if (bundle / 'data').exists() or any(bundle.glob('data-before-restore-*')):
        raise ValueError('Build folder contains user data; rebuild before packaging')
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'OopsAllButtons-{version}-windows-x64.zip'
    with ZipFile(archive, 'w', ZIP_DEFLATED) as zipped:
        for path in sorted(bundle.rglob('*')):
            if path.is_file():
                zipped.write(path, Path('OopsAllButtons') / path.relative_to(bundle))
    with archive.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    checksum = archive.with_suffix('.zip.sha256')
    checksum.write_text(f'{digest}  {archive.name}\n', encoding='ascii')
    return archive, checksum


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', required=True, help='Release version, e.g. 0.1.0')
    args = parser.parse_args()
    version = release_version(args.version)
    if sys.platform != 'win32' or platform.machine().lower() not in ('amd64', 'x86_64'):
        parser.error('Build the Windows x64 release using 64-bit Python on Windows')
    missing = []
    for name in PACKAGES:
        try:
            if importlib.util.find_spec(name) is None:
                missing.append(name)
        except ModuleNotFoundError:
            missing.append(name)
    if missing:
        parser.error('Missing packages: '+', '.join(missing)+'. Install requirements-build.txt first.')
    work = ROOT / 'build' / 'portable'
    dist = work / 'dist'
    # PyInstaller --noconfirm cleans only its named output, leaving release assets alone.
    subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean',
                    '--workpath', str(work / 'work'), '--distpath', str(dist),
                    str(ROOT / 'packaging' / 'windows.spec')], cwd=ROOT, check=True)
    bundle = dist / 'OopsAllButtons'
    (bundle / 'README.txt').write_text(PORTABLE_README, encoding='utf-8')
    (bundle / 'BUILD-INFO.json').write_text(json.dumps({
        'application': 'Oops! All Buttons', 'version': version,
        'built_at': datetime.now(timezone.utc).isoformat(), 'python': sys.version,
        'packages': {package: importlib.metadata.version(package) for package in PACKAGES.values()},
    }, indent=2), encoding='utf-8')
    for path in package_bundle(bundle, version, ROOT / 'release'):
        print(path)


if __name__ == '__main__':
    main()
