"""Optional tray companion. Add menu entries directly to MENU_ITEMS."""
import socket
import webbrowser

MENU_ITEMS = [
    ('Open App', '/'),
    ('Data Sources', '/#sources'),
    ('Tags', '/#tags'),
    ('Page Editor', '/#editor'),
    # ('My New Page', '/#my-page'),
]


def run_tray(url):
    import pystray
    from PIL import Image, ImageDraw
    image = Image.new('RGB', (64, 64), '#164e63')
    ImageDraw.Draw(image).text((14, 22), 'OAB', fill='white')
    def open_link(path):
        return lambda icon, item: webbrowser.open(url + path)
    try:
        addresses = sorted({item[4][0] for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)})
    except OSError:
        addresses = ['Unavailable']
    menu = [pystray.MenuItem(label, open_link(path)) for label, path in MENU_ITEMS]
    menu += [pystray.MenuItem('IP: ' + ', '.join(addresses), None, enabled=False),
             pystray.MenuItem('Close Tray', lambda icon, item: icon.stop())]
    pystray.Icon('python-hmi', image, 'Oops! All Buttons', pystray.Menu(*menu)).run()
