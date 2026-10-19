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


## Server performance optimizations

Added: October 19, 2026. Status: deferred; current performance is satisfactory.

The server review found opportunities to revisit if larger projects, more clients, or a Raspberry Pi show measurable bottlenecks. No urgent rewrite or database-format replacement is proposed.

Suggested priorities:

1. **Cache configuration and index tags by ID.** An authenticated value-batch request currently performs six SQLite configuration reads: users once, session settings twice, sources once, and the full tag collection twice. Avoid eager fallback reads for per-user session settings, and reuse configuration snapshots/indexes. Invalidate caches on configuration changes; user revisions, roles, account removal, and session settings must take effect promptly without weakening authorization.
2. **Recalculate only affected sheets and eliminate duplicate calculation passes.** Completed source batches currently trigger all-sheet recalculation, even for unrelated source updates. A sheet polling read can calculate all sheets and then trigger another calculation in the completion callback. Track dependencies and update affected cells, while preserving consistent snapshots, cross-sheet dependencies, circular-reference detection, and immediate write feedback. Review time spent holding the shared service lock.
3. **Evaluate only affected alarms.** Map updated tags to dependent alarms instead of evaluating every alarm after every batch. Preserve live/background polling behavior, quality handling, activation/clear timing, silence permissions, and audit history. State persistence already occurs only on changes.
4. **Reduce scheduler overhead at scale.** The polling scheduler scans all tags every 50 ms and starts fresh threads for due source batches. Consider persistent source workers and scheduling by next due time. Retain device batching, per-source isolation, live-interest leases, background intervals, and protection against stale reads after writes. Lower priority for small installations.
5. **Conditionally cache static assets.** JavaScript, CSS, images, and symbols currently use no-store. Consider validators such as ETags or Last-Modified so unchanged assets can be reused. Ensure updates and symbol replacements invalidate correctly, and retain authentication checks for protected assets. Expected benefit is faster loading/reconnection and less traffic, rather than faster ongoing device polling.

Review measurements on the development PC, using a temporary database and synthetic tags: returning 20 values through the authenticated request handler had median times of 2.32 ms with 100 configured tags, 3.46 ms with 1,000, and 9.19 ms with 5,000. These exclude real devices, browser rendering, and network latency; they are not Pi benchmarks and do not explain a two-second stall on their own.

Start with profiling on the target hardware and prioritize configuration caching and sheet recalculation. Keep the existing shared polling cache, capable-driver batch reads, compiled-formula cache, and deduplicated error log. Do not reduce password hashing or security checks as a performance shortcut.
