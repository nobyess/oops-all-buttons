"""Optional tray companion with launch and shutdown commands."""
from .browser_launch import launch_browser

def run_tray(url, on_exit=None, icon_path=None, launch=None, on_restart=None):
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
        icon.stop()
        if on_exit:
            on_exit()
    def restart(icon, item):
        icon.stop()
        on_restart()
    menu.append(pystray.Menu.SEPARATOR)
    if on_restart:
        menu.append(pystray.MenuItem('Restart Server', restart))
    menu.append(pystray.MenuItem('Exit', stop))
    pystray.Icon('oops-all-buttons', image, 'Oops! All Buttons', pystray.Menu(*menu)).run()
