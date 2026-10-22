# Oops! All Buttons

A browser-based HMI for building operator screens, connecting device tags, and watching live equipment data. Built with Python and plain HTML, CSS, and JavaScript.

> **Pre-release software:** This project is still under active development and may contain bugs, incomplete features, or breaking changes. Back up your project before updating and test changes before using them with equipment. See the [safety and network warning](#safety-and-network-warning) below.

## What you can build

- Operator screens with controls, shapes, groups, actions, and conditional events.
- SVG/DXF symbols, images, button icons, Markdown text, level indicators, and multitag live trends.
- Alarms with silencing, history, focused notifications, and role-based access.
- Calculated sheet values, persistent SQLite tags, and memory tags for local logic.
- Shared displays with kiosk mode, themes, and optional sign-in.

## Drivers

Connect device data, local tags, and simulations through these drivers:

| Driver | Example devices or data |
| --- | --- |
| EtherNet/IP via PyComm3 | Allen-Bradley ControlLogix and CompactLogix PLCs; Ethernet-accessible SLC 500 and MicroLogix controllers through SLC mode; configured CIP objects through CIP mode. |
| BACnet/IP via BAC0 | BACnet/IP air-handler controllers, thermostats, VAV controllers, and building-automation devices. |
| Modbus TCP via PyModbus | Ethernet PLCs, remote I/O, energy meters, and variable-frequency drives with Modbus TCP enabled. |
| Modbus RTU via PyModbus | Serial/RS-485 temperature controllers, meters, drives, and remote I/O through a suitable serial adapter. |
| LightYak v1 via PySerial | Serial-connected Arduino or other devices implementing the LightYak v1 protocol, with scalar tag browsing and reads/writes. |
| MQTT via Eclipse Paho | MQTT-enabled sensors and ESP32/Arduino projects publishing supported values through a broker. |
| System | Built-in memory tags, date/time, uptime, heartbeat, and connection status; no hardware required. |
| SQLite Database | Persistent named tags stored in an app-managed SQLite file. |
| Simulation | Built-in Air Handler with temperatures, blower, heating, cooling, and writable setpoints. |
| Sheets | Calculated values derived from tags and spreadsheet formulas. |

These are protocol/device examples, not a list of hardware verified with this project. Check your device's protocol support and the [testing notes](#testing-status-and-continued-work). Protocol references: [PyComm3](https://github.com/ottowayi/pycomm3), [BACnet](https://bacnet.org/about/), [Modbus](https://www.modbus.org/introduction-to-modbus), [MQTT](https://mqtt.org/).

## Get started

Use the [getting started guide](docs/GETTING_STARTED.md) for a walkthrough from first launch to device connections, tags, and a live page.

### Windows portable installation

The portable release is for **64-bit Windows**. Python and the driver dependencies are included; no Python installation is needed.

1. Open **[Releases](../../releases)** and download `OopsAllButtons-<version>-windows-x64.zip` from the release assets.
2. Right-click the ZIP and choose **Extract All**. Extract the entire folder to a location you can write to; do not run the executable from inside the ZIP.
3. Open the extracted `OopsAllButtons` folder and run **`OopsAllButtons.exe`**. Keep the `files` folder beside it.
4. Your browser should open automatically. If needed, use **Launch** from the tray icon or open **http://127.0.0.1:8080**.
5. Review and acknowledge the first-run safety notice, then choose a sign-in mode or restore an existing backup.

Your project is stored in the `data` folder beside the executable. The tray menu provides **Launch**, **Restart Server**, and **Exit**. Closing the browser does not stop the server; use **Exit** when you want to shut it down. See [Backups and updates](#backups-exports-and-updates) before installing a newer release.

### First-run setup

Choose **Require sign-in** to create an administrator account, or **Run without sign-in** for automatic full administrator access. Without sign-in, anyone who can reach the server can configure the app and write to devices; activity is recorded as **User**.

Change the sign-in mode and server port later under **Administration → Site Configuration → Server Settings**. The page's **Save/Revert** buttons cover these settings and the login logo. Save asks before restarting the server or changing sign-in access. Enabling sign-in creates an administrator if needed and signs out open sessions.

### Try it without equipment

Fresh projects include an editable **Start Page** with getting-started instructions and three demo tags directly under `System\Memory`: `DemoTankLevel`, `DemoPumpEnabled`, and `DemoMode`. Edit or delete it like any page; restarts and updates will not recreate it. Existing projects and restored backups keep their own pages.

**Try it without a controller:** Open **Data Sources & Tags → Add Source**, choose **Simulation**, leave Air Handler selected, and save. Its tags appear under `Simulation\AirHandler`. Add controls to a page, bind them to those tags, and set `UnitEnableSignal` to `1` to start the model. Outdoor temperature, discharge setpoint, and room heat load are writable. Temperatures use °F.

### Run from source

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

Source installations need additional dependencies for the features you use. These are already included in the Windows portable release:

| Feature | Requirements file |
| --- | --- |
| PyComm3 | `requirements-plc.txt` |
| BACnet/IP | `requirements-bacnet.txt` |
| Modbus TCP / RTU | `requirements-modbus.txt` |
| MQTT | `requirements-mqtt.txt` |
| [LightYak serial](docs/LIGHTYAK.md) | `requirements-lightyak.txt` |
| Sheet formulas | `requirements-sheet.txt` |
| DXF import | `requirements-dxf.txt` |

For example: `python -m pip install -r requirements-modbus.txt`.

## Command-line options

The same options work with `python run.py` and the Windows portable executable. By default, the server listens on **127.0.0.1** (this computer only), opens your browser, and shows a tray icon. The default port is **8080**, unless a different port has been saved in Site Configuration.

| Option | What it does |
| --- | --- |
| `--host <address>` | Select the network interface to listen on. Default: `127.0.0.1`. Use `0.0.0.0` to listen on all IPv4 interfaces, or a specific local IP to use one interface. |
| `--port <number>` | Choose a port from 1–65535. An explicit command-line port overrides the saved Site Configuration port for that launch. |
| `--no-browser` | Start the server without automatically opening a browser. **Launch** in the tray still opens it. |
| `--no-tray` | Start without a tray icon. This does not disable the server or the automatic browser launch. |
| `--kiosk` | Open Microsoft Edge, Google Chrome, or Chromium fullscreen with browser controls hidden. Requires a supported browser; this is separate from an account's Kiosk Mode permissions. |
| `--allowed-host <hostname>` | Accept an additional hostname or DNS alias in browser requests. Supply only the hostname, without a scheme, port, or path. Repeat for multiple aliases. |
| `--trusted-proxy <IP>` | Trust forwarded host, protocol, and client-IP headers from one exact reverse-proxy IP. Use only with a configured HTTPS reverse proxy; this option does not enable HTTPS itself. |
| `--help` | Show the available options and exit. |

### Common examples

**Allow access from other computers on your trusted network:**

```powershell
.\OopsAllButtons.exe --host 0.0.0.0
```

Visit `http://<server-IP>:8080` from the other computer, using your configured port if different. Allow that port through the server computer's firewall as needed. `0.0.0.0` is the listening address, not the address to enter in the browser.

**Use a different port and launch fullscreen:**

```powershell
.\OopsAllButtons.exe --port 8090 --kiosk
```

**Run from source without a desktop browser or tray:**

```sh
python run.py --no-browser --no-tray
```

Open the site separately in a browser. For a remote connection, add `--host 0.0.0.0`. Stop a source server running in a terminal with **Ctrl+C**.

**Accept two DNS aliases:**

```sh
python run.py --host 0.0.0.0 --allowed-host hmi.example.internal --allowed-host operator.example.internal
```

For a Windows shortcut, append options **after** the quoted executable path in its **Target** field:

```text
"C:\Apps\OopsAllButtons\OopsAllButtons.exe" --kiosk --port 8090
```

The server uses Waitress. See [network and HTTPS configuration](docs/WEB_SERVER.md) for hostname validation and reverse-proxy setup. Keep network access limited to trusted users; see the [safety and network warning](#safety-and-network-warning).

## Screenshots

A demonstration page built with ordinary controls and the built-in HVAC simulation. The diagram is an example you can create in the designer; it is not an automatically generated screen.

### Live view

![Air Handler demo with live temperatures, heating and cooling outputs, and temperature trends](docs/images/live-view.png)

### Designer

![Air Handler page in the designer with the Explorer and control properties](docs/images/designer.png)

### Data Sources & Tags

![Built-in Air Handler tags with a live value and page references](docs/images/data-sources-tags.png)

## Backups, exports, and updates

Application documents use `.oab-backup` for backups, `.oab-page` for page exports, and `.oab-sheet` for sheets. Older JSON exports and sheet files remain supported.

Use **Administration → Backup/Restore** to download a backup. Restores take effect after restarting the server.

Before updating, download a backup and exit the server from its tray menu. Then:

1. Extract the new portable release into a new folder.
2. Copy your existing `data` folder beside the new executable. If a restore is pending, also copy `data.restore.oab-backup` (or legacy `data.restore.zip`).
3. Start the new version and verify your project. Keep the old folder until you have checked the update.

For building releases, see [BUILDING.md](BUILDING.md). Development and UI guidelines are in [DEVELOPING.md](DEVELOPING.md).

## Testing status and continued work

Device compatibility and long-running operation need broader testing:

- **Modbus RTU:** untested with physical adapters and devices. Automated simulations have been checked, but real hardware operation is unverified.
- **LightYak v1:** tested with simulated serial devices; physical hardware testing is still needed.
- **BACnet/IP:** mostly untested; broader device and network testing is needed.
- **Modbus TCP:** lightly tested; more device compatibility and reliability testing is needed.

Planned additions include **Modbus device profiles** to simplify configuration, **more built-in symbols** for designing pages, and **built-in help** so instructions are available directly inside the app.

## Safety and network warning

This software can write to PLCs and controllers operating dangerous or moving equipment. Incorrect commands can cause serious injury, death, or property damage. Use only if qualified and authorized, test safely, and keep emergency stops and safety interlocks independent of this HMI. **It is not a safety system.**

Keep the server and devices on a **trusted, access-controlled network**. Do not expose them directly to the internet. Use a securely configured VPN for remote access. The app serves HTTP.

You are responsible for validating the system and operating it safely. This software is provided **“as is,” without warranties**. To the extent permitted by applicable law, the developer assumes no responsibility or liability for injury, damage, loss, or other consequences of its use.

## License

The project's original code is available under the [MIT License](LICENSE). Bundled libraries retain their own licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md) and the [portable license review](docs/LICENSE_REVIEW.md).

## Acknowledgments

I take no credit for the coding work in this project—it was coded with ChatGPT Codex.

Thank you to all the developers who shared their knowledge, code, tools, and documentation. Your contributions made this project possible.
