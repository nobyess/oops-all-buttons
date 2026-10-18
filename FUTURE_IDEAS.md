# Oops! All Buttons Future Ideas

Ideas to revisit when useful. These are deferred improvements, not scheduled work.

## BACnet reliability and diagnostics

Added: October 17, 2026. Status: deferred.

Occasional BACnet value stalls were observed while a PLC counter continued updating normally. The test device is an ESP32 running BACnet Light over Wi-Fi. The cause has not been confirmed; investigate the BACnet driver, device, and network path before changing timeout settings.

The goal is reliable operation with slower or uneven responses, including future MS/TP testing through a BACnet router or bridge.

Possible work:

- Add per-source and per-device timing: current and peak read duration, time waiting for shared access, timeouts, retries, and transitions from ReadPropertyMultiple to individual reads.
- Show freshness separately for each source. The temporary overlay's latest response from any source can hide a pause affecting only BACnet.
- Review batch publication so a slow device or property does not unnecessarily hold back healthy values.
- Preserve meaningful sample times and distinguish fresh, stale, and failed feedback while retaining the last known value where appropriate.
- Review discovery, retry delays, and recovery to avoid repeated request bursts during communication failures.
- Test against real MS/TP equipment through a router or bridge: delayed replies, an offline device alongside healthy devices, lost connectivity, and automatic recovery. Verify that unrelated sources remain responsive.

Start with measurements rather than simply shortening timeouts. Continue using the Wi-Fi ESP32 as a useful uneven-response test case.


## Sitewide import / export

Added: October 18, 2026. Status: full-installation backup/restore implemented in v254; selective merge/import remains deferred.

Administration and first run now support portable full backups, including users/access and persistent SQLite values, applied on restart with the previous data retained. The remaining idea below is a selective project import with conflict review rather than full replacement.

Provide one portable project export/import covering pages, sheets, data sources, tags, images/symbol assets and their references, rather than exporting items individually. Define how user/access settings and persistent SQLite tag values are included. Preserve or consistently remap stable IDs, validate dependencies before import, and offer a review of conflicts and changes before applying the import. Support moving a complete project to another server with clear handling of machine-specific connection settings.


## Executable packaging with PyInstaller

Added: October 18, 2026. Status: Windows portable build implemented in v283.

The portable build includes Python, web assets, the app icon, all supported drivers, sheet calculations, DXF import, and tray support. It separates bundled resources from writable data beside the executable. The build command produces a versioned ZIP and checksum; a GitHub Actions workflow can create draft releases from version tags. See BUILDING.md.

Remaining ideas: a signed distribution, an installer or single-file variant if useful, and separate Linux packages. Additional testing on Windows machines without Python and with physical devices remains useful; the executable smoke test covers frozen imports, formulas, setup, resources, interfaces, data location, restart and login.
