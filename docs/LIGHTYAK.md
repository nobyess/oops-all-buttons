# LightYak v1 serial driver

Install serial support in the application's Python environment:

```sh
python -m pip install -r requirements-lightyak.txt
```

Portable builds already include PySerial. No LightYak device library or separate
client process is required.

1. Open **Data Sources & Tags → Add Source** and choose **LightYak (Serial)**.
2. Choose the serial port on the server computer. Defaults are **115200 baud,
   8 data bits, no parity, 1 stop bit**, with a 2-second response timeout.
3. Startup delay defaults to **0**. Set it to **2 seconds** for an Arduino that
   resets when its port opens. The delay runs once per open/reopen.
4. Test Connection, then save. Testing is optional; browsing or the first poll
   also establishes the connection.
5. Select the source, click **Add Tag**, filter its discovered targets, select
   one, and save. The tag name is supplied by the device and appears with its current value in
   the bottom-left selection summary. Device names can repeat; the
   numeric reference/property identifies each target. Read-only device
   properties appear in an expandable branch named after the device. Application
   tags stay at the top level. Each row shows its name and read/write access on
   the left and its data type on the right. Filtering reveals matching device
   properties even when the branch is collapsed.

The tag browser previews the selected value and identifies the actual device tag.
There is no editable name field. Names are always taken from the discovered device definition,
including on the server when adding or editing. Custom aliases are not accepted.
**Edit Tag** can explicitly bind an existing tag to a newly discovered target
while retaining the HMI tag's identity and page references; its name follows the
selected device target. Saving an older aliased tag restores its device name.
If the firmware gives two targets the same name, the application's existing
per-source unique-name validation prevents adding both; give them distinct names
in the firmware instead.

## Polling and writes

The ordinary live/background scheduler handles LightYak. Read frames use up to
six targets: five requested values plus Catalog Revision as a guard against a
reboot/reflash that leaves the serial port open. A revision check also precedes
writes. Reads are individually sampled by the device, not simultaneous snapshots.

Matching sources on the same physical port share one connection and serialize
all testing, browsing, reads and writes. Each port addresses one device; v1 is
not a multidrop protocol. Shared sources must match baud, parity, stop bits,
timeout, startup delay and retry delay. Different ports operate independently.
Do not share the port with another program or a different serial protocol.

Communication failures close the stale connection. Repeated failures increase
the configured retry delay up to 60 seconds, or retain a configured initial
delay greater than 60. Polls during that pause return bad quality immediately.

Invalid values and ordinary device rejections do not disconnect a healthy
connection. Integer writes require whole values within the target type's range;
Boolean writes accept true/false or 0/1. Float writes must be finite and fit
binary32. Character targets represent one octet, not general strings. Existing
numeric HMI actions can write their numeric byte code; the driver's direct
Python interface also accepts a single Latin-1 character. No string-valued
protocol support or new text-write action is added.

A write timeout or malformed write response leaves the outcome uncertain.
**Writes are never automatically retried.** Reconnect and read back before
choosing whether to issue another write. An OK acknowledges an applied write,
not that the application/ISR has kept that value unchanged.

NaN/infinite read values become bad-quality samples with a null value, preserving
valid JSON without dropping the serial connection. Other targets can still read.

## Catalog changes

Saved bindings retain the name fingerprint and scalar type from when the tag
was added. Each connection browses the catalog and resolves that pair to its
current numeric target. Reordering references or adding tags does not break
existing bindings. A missing name/type or multiple matching targets makes the
tag unavailable and shows a warning in Data Sources & Tags. Rename/type changes
require Edit Tag and explicit reselection; HMI tag IDs and page bindings remain
intact. Names must remain unique for a given type.

Catalog Revision is used only to detect a changed catalog while connected.
Increment it in firmware when changing tags. Polling refreshes the catalog
without reopening the serial port and discards samples from the old revision.
Refresh Tags can also request a refresh manually. Changing source connection
settings requires saving; matching shared sources must be removed or adjusted
before changing port framing.

The revision read and subsequent write are separate requests. They do not create
an atomic, conditional write or an exactly-once guarantee. Keep equipment safety
interlocks independent of this application.

Only protocol v1 is supported. Framing is bounded to 71 decoded bytes, CRC is
CCITT-FALSE, and malformed frames, lengths, scalar encodings and responses are
validated. Unknown protocol extensions are not guessed.

Automated tests use a simulated serial device. Physical LightYak hardware has
not been tested as part of this implementation.

