# Build with: python tools/build_portable.py --version 0.1.0
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, copy_metadata

root = Path(SPECPATH).parent
datas = [(str(root / 'static'), 'static')]
binaries = []
hiddenimports = ['pystray._win32', 'PIL.IcoImagePlugin', 'PIL.PngImagePlugin']
for package, distribution in [
    ('waitress', 'waitress'), ('BAC0', 'BAC0'), ('bacpypes3', 'bacpypes3'), ('pycomm3', 'pycomm3'),
    ('paho.mqtt', 'paho-mqtt'), ('pymodbus', 'pymodbus'), ('serial', 'pyserial'),
    ('formulas', 'formulas'), ('ezdxf', 'ezdxf'), ('pystray', 'pystray'),
]:
    data, binary, hidden = collect_all(package, filter_submodules=lambda name: '.tests' not in name)
    datas += data + copy_metadata(distribution)
    binaries += binary
    hiddenimports += hidden

a = Analysis([str(root / 'portable.py')], pathex=[str(root)], binaries=binaries,
             datas=datas, hiddenimports=hiddenimports,
             excludes=['pytest', 'IPython', 'notebook', 'jupyter', 'tkinter.test'],
             noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='OopsAllButtons',
          console=False, contents_directory='files', icon=str(root / 'static' / 'images' / 'app-icon.ico'),
          debug=False, strip=False, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='OopsAllButtons')
