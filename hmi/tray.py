"""Optional tray companion with launch and shutdown commands."""
from .browser_launch import launch_browser

def run_tray(url, on_exit=None, icon_path=None, launch=None):
    import pystray
    from PIL import Image, ImageDraw
    if icon_path and icon_path.is_file():
        with Image.open(icon_path) as source:
            image = source.convert('RGBA').copy()
    else:
        image = Image.new('RGB', (64, 64), '#164e63')
        ImageDraw.Draw(image).text((14, 22), 'OAB', fill='white')
    def open_app(icon, item):
        (launch or (lambda: launch_browser(url)))()
    menu = [pystray.MenuItem('Launch', open_app, default=True)]
    def stop(icon, item):
        if on_exit:
            on_exit()
        icon.stop()
    menu += [pystray.Menu.SEPARATOR,
             pystray.MenuItem('Stop Server' if on_exit else 'Close Tray', stop)]
    pystray.Icon('oops-all-buttons', image, 'Oops! All Buttons', pystray.Menu(*menu)).run()
