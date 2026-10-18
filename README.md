# Oops! All Buttons

A browser-based HMI for building live operator screens, connecting device tags, and monitoring alarms. Built with Python and plain HTML, CSS, and JavaScript.

## What you can do

- **Design pages** with drag-and-drop controls, shapes, groups, actions, and events.
- **Connect tags** through PyComm3, BACnet/IP, Modbus TCP, and MQTT.
- **Use local data** with System memory tags, time and runtime values, and persistent SQLite tags.
- **Build sheets** with formulas and tag references.
- **Watch live values** with numeric displays, level indicators, and multitag trends.
- **Manage alarms** with trigger conditions, focused notifications, silencing, and history.
- **Manage access** with users, administrators, roles, kiosk mode, and per-user preferences.
- **Back up and restore** the project from Administration or restore a backup during first run.

## Quick start

Install Python 3.11 or newer, then open a terminal in the project folder:

```sh
python run.py
```

The app opens at [localhost:8080](http://127.0.0.1:8080). On first run, complete the safety acknowledgement and create an administrator account. Passwords require at least eight characters.

The core server, System tags, and SQLite storage need no additional Python packages. Install the optional packages for the features you use:

| Feature | Install command |
| --- | --- |
| PyComm3 | `python -m pip install -r requirements-plc.txt` |
| BACnet/IP | `python -m pip install -r requirements-bacnet.txt` |
| Modbus TCP | `python -m pip install -r requirements-modbus.txt` |
| MQTT | `python -m pip install -r requirements-mqtt.txt` |
| Sheet formulas | `python -m pip install -r requirements-sheet.txt` |
| DXF symbol import | `python -m pip install -r requirements-dxf.txt` |
| Desktop tray | `python -m pip install -r requirements.txt` |

On Linux, use `python3` to create a virtual environment, then run the commands above from that environment:

```sh
python3 -m venv .venv
source .venv/bin/activate
```

## Start options

```sh
python run.py --host 0.0.0.0 --port 8080 --no-browser
```

| Option | Purpose |
| --- | --- |
| `--host` | Address to listen on. Defaults to `127.0.0.1`; use `0.0.0.0` for network access. |
| `--port` | HTTP port. Defaults to `8080`. |
| `--no-browser` | Start without opening a browser. |
| `--tray` | Show the optional desktop tray icon. |

Startup lists available IPv4 interfaces. For network access, open `http://<server-IP>:8080` from another device and allow the server through the host firewall. The app serves HTTP. Press **Ctrl+C** in the terminal to stop the server.

## Build your first page

1. Open **Data Sources & Tags**, select **System**, and add a memory tag.
2. Open **Pages**, create or edit a page, and place a Numeric Display linked to that tag.
3. Add a Button with an action that writes to the same tag.
4. Select **Save & View** to use the page live.

## Project data

Configuration, accounts, pages, tags, and imported images are stored in `data/hmi.sqlite3`. Sheet files live in `data/sheets`; persistent tag databases live in `data/databases`.

Use **Administration → Backup/Restore** to download a backup or stage a restore. Restores take effect after restarting the server.

## Development

See [DEVELOPING.md](DEVELOPING.md) for architecture, styling guidelines, and development notes.
