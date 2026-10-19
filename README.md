# Oops! All Buttons

A browser-based HMI for building live operator screens, connecting device tags, and monitoring alarms. Built with Python and plain HTML, CSS, and JavaScript.

## Safety and network warning

This software can write to PLCs and other controllers. Incorrect commands or configuration can cause unexpected machinery movement, serious injury, death, or property damage. Use only if qualified and authorized, test with safely isolated equipment, and verify your configuration. Keep emergency stops and safety interlocks independent of this HMI; it is not a safety system.

Keep the HMI and connected devices on a **trusted, access-controlled network**. Do not expose the server or device ports directly to the internet. For remote access, use a securely configured VPN and limit access to authorized users.

You are responsible for validating suitability and operating the system safely. The software is provided **“as is,” without warranties**. To the extent permitted by applicable law, the developer assumes no responsibility or liability for injury, damage, loss, or other consequences of its use.

## What you can do

- **Design pages** with drag-and-drop controls, shapes, groups, actions, and events.
- **Connect tags** through PyComm3, BACnet/IP, Modbus TCP/RTU, and MQTT.
- **Use local data** with System memory tags, time and runtime values, and persistent SQLite tags.
- **Build sheets** with formulas and tag references.
- **Watch live values** with numeric displays, level indicators, and multitag trends.
- **Manage alarms** with trigger conditions, focused notifications, silencing, and history.
- **Manage access** with users, administrators, roles, kiosk mode, and per-user preferences.
- **Back up and restore** the project from Administration or restore a backup during first run.

## Screenshots

A demo project using simulated values.

### Designer

![Page designer with the toolbox, Explorer, canvas, and control properties](docs/images/designer.png)

### Live view

![Live process page with a level indicator, numeric values, a button, and a multitag trend](docs/images/live-view.png)

### Data Sources & Tags

![Data source and tag management with current values and linked control references](docs/images/data-sources-tags.png)

## Run the portable app (Windows)

Download the Windows portable ZIP from **Releases**, extract the whole folder, and double-click `OopsAllButtons.exe`. Python is included. The browser opens and the tray icon appears automatically. Use **Launch** in the tray to reopen the app or **Exit** to quit.

Your project lives in the `data` folder beside the executable. Keep the `files` folder in place. See [BUILDING.md](BUILDING.md) for building releases, GitHub uploads, and updating a portable installation.

## Run from source

Install Python 3.11 or newer, then open a terminal in the project folder:

```sh
python run.py
```

The browser opens at [localhost:8080](http://127.0.0.1:8080), and the desktop tray is enabled by default. Install `requirements.txt` for tray support, or use `--no-tray` for the standard-library-only server. On first run, complete the safety acknowledgement and create an administrator account. Passwords require at least eight characters.

The core server, System tags, and SQLite storage need no additional Python packages. Install the optional packages for the features you use:

| Feature | Install command |
| --- | --- |
| PyComm3 | `python -m pip install -r requirements-plc.txt` |
| BACnet/IP | `python -m pip install -r requirements-bacnet.txt` |
| Modbus TCP / RTU | `python -m pip install -r requirements-modbus.txt` |
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
python run.py --host 0.0.0.0 --port 8080
```

| Option | Purpose |
| --- | --- |
| `--host` | Address to listen on. Defaults to `127.0.0.1`; use `0.0.0.0` for network access. |
| `--port` | HTTP port. Defaults to `8080`. |
| `--no-browser` | Skip automatic browser launch. |
| `--kiosk` | Open a fullscreen kiosk browser at startup. |
| `--no-tray` | Disable the tray icon (Launch, Restart Server, and Exit). |

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

## Built-in symbol library manager

The standalone desktop manager imports SVG and basic 2D DXF symbols, previews them in a searchable category grid, and lets you rename, categorize, replace the artwork, or remove them. It does not need the HMI server running.

```powershell
python -m venv .venv-symbol-manager
.venv-symbol-manager\Scripts\python.exe -m pip install -r requirements-symbol-manager.txt
.venv-symbol-manager\Scripts\python.exe symbol_library_manager.py
```

On Linux, use `.venv-symbol-manager/bin/python` instead. The manager also accepts `--library PATH` for a different library folder.

Artwork is copied into `static/symbols/assets` as sanitized SVG, with names and categories in `static/symbols/index.json`. Original input files are left alone. Commit and push the entire `static/symbols` folder together with the manager code. Pulling the repository then brings down the latest built-in symbols. Future portable builds include these assets automatically; existing portable downloads need a new release to receive changes.

The library starts empty. In the designer, select a Symbol and open Content → Library to browse its categories or filter by name. Reopen the Content section to pick up changes made in the manager. Choose File imports an SVG or DXF directly. Library selections are copied into the normal saved image assets; removing a library symbol does not alter artwork already embedded in saved controls.

### Solid foreground shapes from LibreCAD

Draw a closed boundary and create a **solid hatch**. Put that hatch on a layer named `FORECOLOR` (case insensitive) to have its filled area follow the Symbol's **Fore Color**, including color events. Other solid hatches and SOLID/TRACE entities use **Back Color** by default. Strokes continue to use Fore Color; Stroke Width only changes actual strokes, not filled geometry. Closed outlines alone remain unfilled.

This works through both Choose File and the Symbol Library Manager. Re-import older DXF library entries to apply the layer convention; existing controls retain their saved artwork until replaced.

Symbols and images have a **Rotate 90°** button in Content. Each click turns the artwork clockwise inside the existing control boundary; the source artwork is unchanged. Polyline has the same button under Shape; it rotates the editable points about their center and recalculates the boundary.

### Fullscreen browser launch

```powershell
python run.py --kiosk
```

For a newly built portable release, use `OopsAllButtons.exe --kiosk`, or add `--kiosk` to its shortcut target. The tray offers **Launch**, **Restart Server**, and **Exit**. Launch uses the same fullscreen option as startup. Browser launch and the tray are enabled by default. `--no-browser` skips startup browser launch; Launch still uses fullscreen mode when `--kiosk` is set. `--no-tray` disables the tray.

Kiosk launch uses an installed Microsoft Edge, Google Chrome, or Chromium browser in a fullscreen window without the address bar or window borders. It uses a separate profile in the operating system's user cache/local application-data folder. Close the browser with Alt+F4 on Windows/Linux (Command+Q on macOS); the server remains running until stopped. This display option does not change user accounts, access roles, or the HMI's per-user kiosk setting. A supported browser and a graphical desktop session are required.

## Acknowledgments

I take no credit for the coding work in this project—it was coded with ChatGPT Codex.

Thank you to all the developers who shared their knowledge, code, tools, and documentation. Your contributions made this project possible.

**Restart Server** cleanly stops and relaunches the application with the same startup options. It reloads saved project data and source-code changes when running from Python. Save browser edits first; you will need to sign in again, and existing browser tabs may need refreshing. A portable executable must be rebuilt to include code changes. **Exit** shuts down the server and removes the tray icon.


## Modbus RTU / RS-485

Install `requirements-modbus.txt`, restart the server, then add a **Modbus TCP / RTU (PyModbus)** source and choose **RTU (Serial / RS-485)**. Existing Modbus sources default to TCP. Tag addresses, register types, byte/word ordering, and read/write behavior are shared between TCP and RTU.

- Create one source per device Unit ID (1–247), selecting the serial port on the **server**. Detected ports are suggested; you can also type a port such as `COM3`, `/dev/ttyUSB0`, or a persistent `/dev/serial/by-id/...` path. On Linux the server account needs permission to access the port.
- Devices on one physical port share a single serial client and a FIFO request queue. Reads yield between register groups, and writes use the same queue. Sources on that port must agree on baud rate, parity, stop bits, response timeout, and local echo. Data bits are fixed at 8. Conflicting settings are rejected; remove other sources sharing the port before changing bus settings on the remaining source.
- Use a USB-to-RS-485 adapter with automatic direction control. Manual RTS direction switching and broadcast Unit ID 0 are not supported. This application should be the only Modbus client controlling the bus.
- Defaults are 19200 baud, no parity, one stop bit, a 0.5-second response timeout, and a 5-second initial offline retry delay. Match your equipment and allow enough response time for the baud rate and register count.
- Communication failures stop the remainder of that source's batch and apply per-Unit-ID backoff: a minimum cooldown of 5, 10, 20, 40, then 60 seconds before the next scheduled poll can try again. Background polling intervals can make recovery take longer. Other devices continue taking turns. The first failed request still occupies the bus until its timeout; backoff limits repeated disruption. A valid Modbus exception reply does not trigger offline backoff, and failed writes are never automatically retried.
- **Test Connection** verifies that the serial port can be opened; actual device connectivity is verified by reading configured tags. Source details show shared-source count, queue depth, bus request/failure counts, timing, and retry countdown. Replacing the last source or shutting down closes the shared port.

RTU was verified with concurrent simulated devices and actual PyModbus/pySerial RTU frames over a local test transport. Testing with physical adapters and devices is still needed. Updated source installations need the new dependency; older portable releases require a new build to include RTU support.

### Air Handler simulation

Enable **Administration → Simulation → Enable Simulation** and save to add the built-in `Simulation` source. The Air Handler module provides tags under `Simulation\AirHandler`, including supply/return/outdoor temperatures, heating and cooling outputs, fan commands, and airflow proof. Temperatures are in Fahrenheit and outputs are percentages.

Use normal actions to write `UnitEnableSignal` (0/1), `DischargeAirSetpoint` (35–120 °F), `OutdoorAirTemperature` (−40–130 °F), and `RoomLoadWatts` (0–15,000 W). The unit starts off; calculated outputs are read-only. The approximate room model includes outdoor-air mixing, heat gain, and a three-second airflow proving delay. Simulation speed can be increased for testing.

Settings persist in backups, but saving simulation settings or restarting resets the model and its inputs. Disabling retains the tag paths with bad quality so page bindings remain intact. After a long server pause, catch-up is limited to five simulated minutes.
