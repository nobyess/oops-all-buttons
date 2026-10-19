"""Desktop browser launching; kiosk uses its own profile, not an existing browser session."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import webbrowser


def kiosk_browser():
    names = ['msedge', 'chrome', 'chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge', 'microsoft-edge-stable']
    candidates = []
    if sys.platform == 'win32':
        for variable in ('PROGRAMFILES(X86)', 'PROGRAMFILES', 'LOCALAPPDATA'):
            base = os.environ.get(variable)
            if base:
                candidates.extend(Path(base) / relative for relative in (
                    'Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe'))
    elif sys.platform == 'darwin':
        candidates.extend([Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
                           Path('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')])
    candidates.extend(Path(found) for name in names if (found := shutil.which(name)))
    return next((str(path) for path in candidates if path.is_file()), None)


def kiosk_profile(url):
    if sys.platform == 'win32':
        base = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData' / 'Local'))
    elif sys.platform == 'darwin':
        base = Path.home() / 'Library' / 'Caches'
    else:
        base = Path(os.environ.get('XDG_CACHE_HOME', Path.home() / '.cache'))
    return base / 'OopsAllButtons' / 'kiosk' / hashlib.sha256(url.encode()).hexdigest()[:16]


def launch_browser(url, kiosk=False):
    if not kiosk:
        return webbrowser.open(url)
    executable = kiosk_browser()
    if not executable:
        raise RuntimeError('Kiosk mode requires Microsoft Edge, Google Chrome, or Chromium. Install one or start without --kiosk.')
    profile = kiosk_profile(url)
    profile.mkdir(parents=True, exist_ok=True)
    command = [executable, '--kiosk', '--new-window', '--no-first-run', '--user-data-dir=' + str(profile)]
    if 'edge' in Path(executable).name.lower():
        command.append('--edge-kiosk-type=fullscreen')
    command.append(url)
    subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return True
