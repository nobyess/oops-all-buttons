"""Optional tray companion. Add menu entries directly to MENU_ITEMS."""
import socket
import webbrowser

MENU_ITEMS = [
    ('Open App', '/'),
    ('Data Sources & Tags', '/#sources'),
    ('Sheets', '/#sheets'),
    ('Pages', '/#pages'),
    ('Administration', '/#administration'),
    ('Alarms', '/#alarms'),
]


def run_tray(url, on_exit=None, icon_path=None):
    import pystray
    from PIL import Image, ImageDraw
    if icon_path and icon_path.is_file():
        with Image.open(icon_path) as source:
            image = source.convert('RGBA').copy()
    else:
        image = Image.new('RGB', (64, 64), '#164e63')
        ImageDraw.Draw(image).text((14, 22), 'OAB', fill='white')
    def open_link(path):
        return lambda icon, item: webbrowser.open(url + path)
    try:
        addresses = sorted({item[4][0] for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)})
    except OSError:
        addresses = ['Unavailable']
    menu = [pystray.MenuItem(label, open_link(path), default=path == '/') for label, path in MENU_ITEMS]
    def stop(icon, item):
        if on_exit:
            on_exit()
        icon.stop()
    menu += [pystray.MenuItem('IP: ' + ', '.join(addresses), None, enabled=False),
             pystray.Menu.SEPARATOR,
             pystray.MenuItem('Stop Server' if on_exit else 'Close Tray', stop)]
    pystray.Icon('oops-all-buttons', image, 'Oops! All Buttons', pystray.Menu(*menu)).run()
