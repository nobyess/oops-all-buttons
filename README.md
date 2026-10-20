# Oops! All Buttons

A browser-based HMI for building operator screens, connecting device tags, and watching live equipment data. Built with Python and plain HTML, CSS, and JavaScript.

**[Getting started guide](docs/GETTING_STARTED.md)** — from first launch to connecting a device, adding tags, and building a live page.

## Get started

**Windows:** Download the portable ZIP from **[Releases](../../releases)**, extract the entire folder, and run `OopsAllButtons.exe`. Python and the driver dependencies are included.

Create an administrator account on first run, or restore an existing backup. The tray menu provides **Launch**, **Restart Server**, and **Exit**. Keep the `files` folder beside the executable; your project is saved in `data`.

**Try it without a controller:** Open **Administration → Simulation**, enable the Air Handler, and save. Its tags appear under `Simulation\AirHandler`. Add controls to a page, bind them to those tags, and set `UnitEnableSignal` to `1` to start the model. Outdoor temperature, discharge setpoint, and room heat load are writable. Temperatures use °F.

## What’s included

- A visual designer with controls, shapes, groups, actions, and conditional events.
- SVG/DXF symbols, images, numeric displays, level indicators, and multitag live trends.
- PyComm3, BACnet/IP, Modbus TCP/RTU, and MQTT connections.
- System memory/time tags, persistent SQLite tags, and calculated sheets.
- Alarms with silencing, history, focused notifications, and access roles.
- Users, kiosk mode, themes, and project backup/restore.
- A built-in Air Handler simulation for learning and testing.

## Testing status and continued work

This is an early public release, and testing is still limited:

- **Modbus RTU:** untested with physical adapters and devices. Automated simulations have been checked, but real hardware operation is unverified.
- **BACnet/IP:** mostly untested; broader device and network testing is needed.
- **Modbus TCP:** lightly tested; more device compatibility and reliability testing is needed.

Planned additions include **Modbus device profiles** to simplify configuration, **more built-in symbols** for designing pages, and **built-in help** so instructions are available directly inside the app.

## Screenshots

A demonstration page built with ordinary controls and the built-in HVAC simulation. The diagram is an example you can create in the designer; it is not an automatically generated screen.

### Live view

![Air Handler demo with live temperatures, heating and cooling outputs, and temperature trends](docs/images/live-view.png)

### Designer

![Air Handler page in the designer with the Explorer and control properties](docs/images/designer.png)

### Data Sources & Tags

![Built-in Air Handler tags with a live value and page references](docs/images/data-sources-tags.png)

## Run from source

Use Python 3.11 or newer. From the project folder:

```sh
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
python run.py
```

On Linux, use `python3` to create the environment. The browser opens at **http://127.0.0.1:8080**. Use `--no-browser --no-tray` when running without a desktop.

Install the additional dependencies for the features you need:

| Feature | Requirements file |
| --- | --- |
| PyComm3 | `requirements-plc.txt` |
| BACnet/IP | `requirements-bacnet.txt` |
| Modbus TCP / RTU | `requirements-modbus.txt` |
| MQTT | `requirements-mqtt.txt` |
| Sheet formulas | `requirements-sheet.txt` |
| DXF import | `requirements-dxf.txt` |

For example: `python -m pip install -r requirements-modbus.txt`.

For access from another computer, use `python run.py --host 0.0.0.0` and visit `http://<server-IP>:8080`. The default port is 8080. `--kiosk` launches a supported browser fullscreen; `--port` changes the server port.

## Backups and updates

Use **Administration → Backup/Restore** to download a backup. Restores take effect after restarting the server.

For a portable update, exit the old server, extract the new release into a new folder, and copy your `data` folder beside the new executable. If a restore is pending, also copy `data.restore.zip`. Keep the old installation until you have verified the update.

See [BUILDING.md](BUILDING.md) for portable builds and releases, and [DEVELOPING.md](DEVELOPING.md) for development notes.

## Safety and network warning

This software can write to PLCs and controllers operating dangerous or moving equipment. Incorrect commands can cause serious injury, death, or property damage. Use only if qualified and authorized, test safely, and keep emergency stops and safety interlocks independent of this HMI. **It is not a safety system.**

Keep the server and devices on a **trusted, access-controlled network**. Do not expose them directly to the internet. Use a securely configured VPN for remote access. The app serves HTTP.

You are responsible for validating the system and operating it safely. This software is provided **“as is,” without warranties**. To the extent permitted by applicable law, the developer assumes no responsibility or liability for injury, damage, loss, or other consequences of its use.

## Acknowledgments

I take no credit for the coding work in this project—it was coded with ChatGPT Codex.

Thank you to all the developers who shared their knowledge, code, tools, and documentation. Your contributions made this project possible.
