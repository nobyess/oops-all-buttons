# Python HMI Future Ideas

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
