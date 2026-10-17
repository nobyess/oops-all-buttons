# Oops! All Buttons

A small, human-editable foundation, with a Python backend and local HTML/CSS/JavaScript interface. No frontend build tools, CDN, or Node.js are needed to run. Memory needs no Python packages; PyComm3 uses optional pycomm3; Sheet uses optional formulas. Python 3.11+.

## Run

Open a terminal in this folder:

```powershell
python run.py
```

The browser opens at http://127.0.0.1:8080. Create the initial account with a password of at least 12 characters. Configuration is stored in `data/hmi.sqlite3`. Sessions expire after eight hours or server restart.

Optional tray icon:

```powershell
python -m pip install -r requirements.txt
python run.py --tray
```

Closing the tray leaves the server running; Ctrl+C in the terminal stops it. For LAN access, pass `--host 0.0.0.0`; complete initial setup locally first. This starter uses HTTP and a standard-library development server. Add a production server/TLS and operational hardening before deployment beyond the trusted development environment.

## Linux / Raspberry Pi / Orange Pi

Run from an extracted project folder that your user can write to. Python 3.11+ is required; use a virtual environment for optional drivers:

```bash
python3 -m venv .venv
source .venv/bin/activate
# Install only the drivers/features you use:
python -m pip install -r requirements-plc.txt -r requirements-sheet.txt
# Other optional files: requirements-bacnet.txt, requirements-modbus.txt,
# requirements-mqtt.txt, requirements-dxf.txt
python run.py --host 0.0.0.0 --no-browser
```

If `venv` is unavailable on Debian/Ubuntu/Raspberry Pi OS, install the distribution's `python3-venv` package. The Memory driver and core server need no additional Python packages. From another computer, open `http://<Linux-server-IP>:8080`. The server must be allowed through the host firewall. Normal operation on port 8080 does not require running as root.

Linux interface pickers use the native `getifaddrs` API and list active IPv4 interfaces by name and address, including multiple addresses on one adapter. Hostname resolution is not used for Linux discovery. This works without `ip`, `ifconfig`, or an extra Python dependency. Choose the Linux server's interface in PyComm3/BACnet settings; BACnet also needs the correct subnet prefix. Saved interface IP addresses may need changing when moving a project between machines. WSL/container interfaces belong to that environment and are not necessarily the host's physical LAN interface; direct Linux deployment avoids that additional networking layer for BACnet discovery.

For a headless installation, leave `--tray` off and use `--no-browser`. The optional tray needs a graphical desktop and a compatible system-tray implementation; it is not needed for the web server or drivers. The existing `data/` folder contains configuration, sheets, and assets; copy it with the server stopped when moving an existing project. Keep both installations stopped while replacing their data files.

## PyComm3 PLCs

Install the optional driver in the Python environment used to run the server:

```powershell
python -m pip install -r requirements-plc.txt
```

pycomm3 1.2.16 runs in the Python environment used by the server. Routed ControlLogix identity and tag discovery were verified on a 1756-L81E; SLC and generic CIP read/write flows have simulated-transport coverage and still need validation on those devices.

Add an PyComm3 source. Choose Local network interface, enter Device network path, then choose Mode: Logix, SLC, or CIP. Auto Select shows Working... while querying the identity at that path and selects the detected family on success. Errors appear in a popup; unknown models use CIP and the type remains manually selectable. Identity detection honors the selected interface, uses a minimum five-second socket timeout, and does not write device values. Use a routed path such as 192.168.1.10/0 for a CPU behind an ENBT; the shorthand is expanded for generic CIP routing.

Test Connection is optional and appears on the left of the dialog footer, alongside Cancel and Save. Test status remains inside the dialog; there are no untested-save warnings or source-list test controls. The test opens a session and queries device identity (plus tag definitions for Logix) without writing values. Newly added sources default to a five-second timeout. Background (20 seconds) and Live (0.5 seconds) remain per-source intervals limited to 0.1–60 seconds; Live must be no slower than Background. Existing sources retain their stored intervals/timeouts and default to Logix if no protocol was stored.

On Tags, use + Add Tag beside the source name. Memory uses manual entry. Logix opens a cached tag browser with controller and program-scoped tags, a filter, and Refresh PLC Tags. Expand program groups, arrays, or structures inline to select individual elements/members. Program groups start collapsed; additional rows load automatically when scrolling, in batches of 200. Scalar/string leaves are importable; a whole array/UDT is not imported as a scalar. External access determines read-only status. Tag names are automatic and read-only: controller tags use their PLC name, and program tags use ProgramName.TagName (for example MainProgram.TestBit), without a source name or network path; the same address cannot be imported twice from one source. New PLC tags appear after Refresh, which re-downloads definitions. Definitions are also downloaded after restarting or reconnecting a source. The Tag Selector shows `Source Name\Tag Name`; program names and periods remain part of the tag name. Device network paths remain in source connection settings.

Server workers batch imported tags and cache values, quality, timestamps, and errors. Browser requests never trigger PLC reads. Viewed pages and popups promote their referenced tags to the source Live interval; other tags use Background. A Tag Selector promotes its selected tag while open. Clients share poll results, and Live leases expire after eight seconds without a heartbeat. Hidden tabs release Live interest. Each source has one serialized connection and at most one polling job; source failures do not block other sources. Visual events run only in open browser views when samples arrive.

Tag values may be numbers, BOOLs or strings. Arithmetic actions support numeric/BOOL tags. Integer writes require whole numbers and BOOL writes require 0 or 1. Successful writes leave cached feedback unchanged until a scheduled device read supplies the actual value. Read/modify/write actions serialize within the HMI source but are not atomic against PLC logic or other clients.

## Try the Memory example

1. Add a memory data source named `Simulation`.
2. Add a tag named `Counter`, source `Simulation`, address `counter`.
3. Open Page Editor and add a Button and Numeric Display by clicking or dragging the toolbox items.
4. Select the Numeric Display, open Events, and choose `Counter` using Display Source Tag. Controls no longer have a Tag property.
5. Select the Button, open Actions, press +, use the Tag Selector to choose `Counter`, choose Click, Increment By, and value 1.
6. Click View in the top menu bar. It saves your current page before opening runtime. Pressing the button updates the display.

## What is implemented

- First-run account setup, hashed passwords, cookie sessions, CSRF tokens, top-right username and login/logout.
- Centered content, modal data source/tag creation, current source status, and guarded removal.
- Tag searching grouped by source; scrolling usage lists link to pages and controls.
- Each source heading places Add Tag on the right. Larger Source headings collapse their indented tag rows; search opens matching groups temporarily. Both editor sidebars use horizontal section dividers.
- Data Sources also places Add source at the right of its heading. The editor's three frames meet the top menu without a gap; status messages appear over the center frame.
- Status messages use a rounded, bottom-centered toast: save confirmation fades away after about three seconds. Repeated background errors do not keep resetting the dismissal timer.
- Hamburger launcher with an icon grid for Data Sources, Tags, and Pages.
- Pages landing screen with search, add, edit, view, rename, and remove. Referenced destination pages cannot be removed until other pages' navigation/popup references are removed.
- Editor keeps its toolbox above a full-height Explorer list. Its first entry is the page itself; select it for Name, Width, Height, Back, Horizontal Alignment, and Vertical Alignment. Save Page, Grid, Zoom, and View remain in the menu bar.
- Toolbox and control listbox; docked left/right sidebars, Properties/Actions/Events tabs, drag movement, eight resize handles.
- Single-line Visible (at the top of Layout), Bold, and Italic checkboxes; Font selector with Default (System), Arial/Helvetica, Verdana, Georgia, Times New Roman, and Fixed Width. Font stacks use local/generic fallbacks; existing controls keep their default appearance until edited.
- Centered side-by-side BackColor/ForeColor pickers in Properties and Set Colors events. Derived Right/Bottom values are centered at the bottom of Layout.
- Page search uses the inline hint `Filter..`. Font face sits directly below Font, followed by Size. Color labels are Back/Fore. Actions/events have no enable switches.
- Grid dropdown: Off, 5, 10, or 20 pixels, shared by drawing/movement/resizing. Continuous one-pixel grid lines span the entire canvas.
- Reusable Tag Selector with All Sources/source list, search, current value, confirm/cancel, and clear selection.
- Label, Numeric Display, Button, and a sample custom Indicator.
- Runtime removes editor frames from controls. Buttons smoothly fade to a 15% darker tint of their BackColor while pressed and fade back on release, without shadows or movement; labels/displays have no border. Keyboard focus and reduced-motion preferences are supported. Text selection is limited to editable fields.
- Toggle, Set To, Increment By, Decrement By. Existing Clear rules migrate to Set To 0.
- Cached real-source polling (Live 0.5s / Background 20s by default), server-side writes, serialized actions.
- Optional tray links and IPv4 address listing.
- Mouse actions for every control: Mouse Down, Mouse Up, Click; tag write operations execute in gesture order.
- Visual condition events: Show, Hide, Set Colors; compare to values or other tags, including Within Range and Out Of Range.

## Events and usage

Actions/events are always active, with no enable switches. Incomplete or invalid rules can be saved and are silently skipped at runtime; valid rules later in the list still run. Existing enabled/disabled flags are removed during migration, so previously disabled complete rules now run. Structural page errors (such as invalid dimensions or duplicate control IDs) still require correction. Missing display bindings do not block saving; they display unavailable values until repaired.

## Pages, navigation, and popups

The Tag Selector footer shows the full selected tag path in bold and its current value. Paths consistently use `Source Name\Tag Name` across drivers, picker fields, rule descriptions, references, and formula insertion. Device network routes and internal IDs are not tag display paths. Long paths wrap rather than truncate; tag references still use the same stable tag ID.

Save Page sits immediately to the left of View. Ctrl/Cmd+S saves the HMI page in the editor, including a focused property field. Delete removes the selected control after confirmation; it also works with focus in Explorer, and leaves text/number inputs and other dropdowns alone. The Delete Control button uses the same confirmation. Deletion can be undone. These shortcuts are scoped to the editor; browser shortcuts elsewhere are unchanged.

Grid Style beside grid size offers Hide, Lines, or Dots. Hide leaves snapping active at the selected size; size Off disables snapping and the drawing. Grid style is editor view state and does not affect runtime. Order also offers Move Forward and Move Backward to move one layer at a time, between Bring To Front and Send To Back. Ordering supports Undo/Redo.

Editor Undo/Redo keeps up to 100 changes per page in the browser session. Use the toolbar or Ctrl/Cmd+Z to undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z to redo. Inputs retain native text undo while focused. Dragging/resizing is one history step; typing the page name is grouped. History includes properties, rules, image assignment, adding/removing controls, paste/duplicate, and order changes. Zoom/pan and selection are view state, outside history. Save an undone state to apply it to runtime; uploads remain stored when image assignment is undone. Discarding unsaved edits clears that page's history.

Right-click a control in the editor for Order (Bring To Front / Send To Back), Cut, Copy, Duplicate, or Paste. Click Order to expand its commands. Right-click empty workspace for Paste at that page position. Copy uses an internal browser-session clipboard and works between pages; Duplicate offsets by 20 pixels. Copies preserve settings, image references, actions and events, with fresh control/rule IDs. Pasted controls respect zoom, grid snapping and page bounds. Ordering follows the saved controls array and applies in runtime/popups too. Click elsewhere or press Escape to dismiss the menu.

Image controls support uploaded SVG, PNG, JPEG, GIF, WebP, and BMP files up to 5 MB. Select Image in the toolbox, choose a file in Properties, then choose Fit (preserve proportions), Fill (crop), Stretch, or Original Size. Description supplies alternative text. Images support the usual layout, visibility, background, mouse actions, and visual events. Unassigned images show a placeholder only in the editor. SVGs are displayed as image elements rather than inline markup. The backend checks format signatures/XML structure; the browser decodes the image. Uploaded assets are deduplicated by content and stored in the existing SQLite database, independently of pages; keep `data/` when updating. Clearing a control's image does not delete its uploaded asset, allowing saved references to remain valid.

Page Layout includes Show Border (enabled for existing pages). The border is drawn inside the page bounds so its edges remain visible in scroll containers, including runtime and popup views. Disable it for a clean runtime page; the editor keeps its design boundary and selection handles available.

Alignment uses plain icon buttons: Left/Center/Right and Top/Center/Bottom. Page alignment moves the page within the runtime viewport. Font-bearing controls offer separate text alignment in their Font section, applied in the editor, runtime, and popups. Existing controls default to centered text in both directions. Each icon has a tooltip, accessible name, and selected state.

The launcher offers Data Sources, Tags, and Pages; open an editor from Pages. Page Back color is centered in the inspector. Page/control colors and Set Colors events include Opacity (%) beside the standard color selection: 100 is solid, 0 transparent, and intermediate values translucent. Existing colors remain solid. Alpha is stored in CSS hex color format without dimming a control's text or child content.

Click an empty part of the page/grid or surrounding editor workspace to select the page and show its properties. Its highlighted border includes right, bottom, and bottom-right resize handles. Resizing uses the current zoom and grid snap, keeps the top-left design origin fixed, and leaves control coordinates unchanged. The grid's disabled option is labeled Off.

Editor Zoom offers 25–200%. Drag with the middle mouse button to pan. The draft page is centered whenever it fits in the editor workspace; larger pages remain scrollable. Scrollbars also work. Zoom and scroll position are retained per page during the browser session and do not change saved page dimensions or runtime appearance. Grid snapping, resizing, and toolbox drops use page coordinates at every zoom level.

Open Pages from the launcher to manage pages. The editor no longer includes a page-navigation list in its left sidebar. The Explorer list fills the remaining sidebar height and includes `Name (this page)` as its first entry.

Page Width/Height default to 1000×640 and may be 20–10000 pixels. Background defaults to white. Runtime Horizontal Alignment supports Left/Center/Right and Vertical Alignment supports Top/Center/Bottom; CSS layout follows viewport resizing without changing control coordinates. Oversized pages remain scrollable. Editor pages stay anchored at the top left for predictable design coordinates.

In a button's Actions tab, add an action, choose its mouse trigger, then choose Navigate to Page or Popup Page. A destination dropdown appears; Popup also offers Centered or Mouse Location. Page actions do not need a tag. Keyboard activation uses centered placement when no mouse point is available.

Popups are non-modal, can be dragged by their caption, and close with × or Escape while focused. Initial mouse placement and later dragging/resizing are clamped to the viewport. Large popup pages use a scrollable window so its caption and close control remain visible. Popup controls receive the same live values and visual events as ordinary runtime pages. Navigating away closes open popup windows. Pages may open themselves in a popup; avoid configuring recursive automatic mouse actions that open unlimited windows.

Existing pages receive the new layout defaults automatically. Keep your existing `data/` folder when updating.

## Events and usage

Events are evaluated in open runtime pages and popups when their referenced tag samples arrive. Choose Source Tag, comparison, and Show/Hide/Set Colors. Within Range and Out Of Range reveal Range Start and Range End; operands can be values or tags. Within Range includes both boundaries. Closed pages do not evaluate events.

Visual effects apply while conditions are true, including at startup. Normal control properties return when no matching rule overrides them; later matching rules win. Bad-quality or incomplete rules do not apply. Legacy tag-write events retain false-to-true behavior: each viewing browser can submit them, initial true conditions do not write, and no browser means no event writes.

Mouse actions have Mouse event settings. Choose the tag, Mouse Down/Mouse Up/Click, and the operation. Unfinished actions/events can be saved and do not run. Complete operations require valid tags. Mouse actions execute in listed/gesture order and stop at the first failure within that gesture; they are not a transaction.

References in optional display bindings, actions, and events (including comparison tags) protect tags and their source from removal. Usage refers to saved pages; save your changes before deleting sources/tags. Removing an unused source also removes its unused tags, after a confirmation dialog. Removing a page releases its references. The original single page migrates to Main automatically; old control tag bindings migrate out of Properties. Retain your existing `data/` folder when updating.

Drivers implement `status()` returning `{'quality': 'good' or 'bad', 'message': '...'}`. Status is refreshed every second while viewing sources. The included memory driver reports simulation status; actual COM/network health requires a real adapter.

## Deliberate starter limits

This is a framework, not a complete FUXA replacement. BACnet/Modbus adapters, roles, credential recovery, audit logging, protocol write priorities, and service installation are future work. PyComm3 discovery/import and Undo/Redo are implemented. There is one administrator account. Memory tags are numeric; PLC tags can also be BOOLs/strings. Arithmetic actions are numeric; toggle uses 0/1. Simulation values reset on restart. Configuration persists. Edit mode never dispatches button actions. Page/source/tag removal is permanent after confirmation; make database backups as needed.

The original proposed FastAPI/WebSocket stack remains a suitable upgrade. This deliverable uses standard-library HTTP and polling to run immediately with no dependency installation. Business logic is independent of HTTP so that migration does not require rewriting drivers or actions. Use one backend process with this in-memory simulation and session implementation.

## File map

| File | Responsibility |
| --- | --- |
| `run.py` | HTTP routes, startup, setup and sign-in |
| `hmi/service.py` | Sources, tags, read/write coordination |
| `hmi/store.py` | SQLite configuration |
| `hmi/drivers.py` | Driver interface and registry |
| `hmi/actions.py` | Action definitions and registry |
| `hmi/events.py` | Comparisons, ranges, and value/tag operands |
| `hmi/tray.py` | Tray menu and callbacks |
| `static/controls.js` | Control definitions, defaults, properties, rendering |
| `static/tag-selector.js` | Reusable popup and tag field component |
| `static/launcher.js` | Application icon menu and destinations |
| `static/app.js` | Navigation, forms, editor and runtime |
| `static/style.css` | Appearance |
| `DEVELOPING.md` | Copyable extension recipes |

## Checks

```powershell
python -m unittest discover -s tests -v
node tests/frontend.mjs
```

Thirty-two backend tests cover actions/concurrency, migration, protected deletion, legacy/visual events, ranges and tag comparisons, unbound saves, source fault status, and HTTP setup/session/logout. Component checks cover Tag Selector filtering/confirm/cancel/clear, stable button updates, launcher open/navigation/close, and popup placement bounds. JavaScript syntax was checked with Node. Component checks use a DOM test double; full browser layout and pointer interaction verification remains unverified because local-server connectivity was blocked in the development environment. Node is only needed for optional frontend checks.


### Editing sources and tags

Use Edit on a Data Sources row to change PLC type, network path, connection timeout, and source-level Background/Live polling. Both polling intervals accept 0.1–60 seconds; Live must be less than or equal to Background. Rate changes retain the connection; changing connection details replaces the driver and resets connection-test status unless the new settings were tested. Defaults remain Background 20 seconds and Live 0.5 seconds.

Use Edit on a Tags row to rename Memory/SLC tags. Device/cell addresses and permanent identities stay fixed. Sheet cell names remain their coordinates. Write permissions are determined by the device, not cached discovery metadata.


### Update timing

Button actions are submitted immediately and remain ordered. Set To writes directly; Toggle, Increment, and Decrement first read the current device value. Device I/O remains serialized per source, so an action may wait for an in-progress poll. A successful write does not replace feedback or force a browser refresh. The next scheduled device read and browser batch request provide actual feedback. Multiple operators can submit actions without ownership or interlocks added by the HMI.

Each live source has an independent browser batch timer at its configured Live interval. Timers are not synchronized to device polls; the next request starts after the previous response plus the interval. The browser evaluates affected events and paints affected controls from received samples, without a separate event timer. Short pulses between reads may be missed. The Tag Selector requests its selected tag every 100 ms; management status refreshes once per second.


Management (1000 ms), Tag Selector (100 ms), and default Live (500 ms) refresh values are centralized in static/refresh-policy.js. Live-view batches use each source’s configured Live interval. These browser rates do not alter source-level PLC polling. The PyComm3 browser is a lazy tree with collapsed programs, inline structure/array expansion, right-aligned types, and automatic additional rows when scrolling. Use Left/Right arrows or click a branch to collapse/expand it.


### Choosing a PLC network interface

PyComm3 Add/Edit source dialogs include Local network interface. Automatic uses system routing; selecting a server IPv4 address binds all reads, writes, discovery, and Test Connection for that source to that address. This is useful when Ethernet and Wi-Fi share the same subnet. Windows and Linux list active adapters by name and IP without extra dependencies. The selected address is saved per source; changing it reconnects the driver and invalidates the previous test result. If the adapter is unavailable or its IP changes, edit the source and select its current address; the driver reports a connection failure rather than silently switching networks. No Windows routes or adapter settings are modified.


### Renaming data sources

Edit a data source and change Name. Sources now have an immutable internal id and a separate display name. Existing sources migrate automatically by retaining their old ids and adding their existing names as display names; no tag references need rewriting. Newly created sources receive generated ids. A rename alone keeps driver instances, cached values, network settings, test status, tags, and saved page bindings/actions/events intact. Source lists, tag group headers, filters, PLC browser headings, and the Tag Selector display the new name. Tag names and protocol paths are not renamed. Empty and duplicate source display names are rejected (case-insensitive).


### SLC and generic CIP tags

SLC/MicroLogix sources use a data-file dialog with a tag name and a single address, such as N7:0, F8:0, B3:0/0, or T4:0.ACC. Timer/counter/control structures require an individual member. Reads and writes use pycomm3.SLCDriver; these devices do not use the Logix symbolic tag tree.

CIP sources use a separate scalar-attribute dialog: tag name, class, instance, attribute, data type, and Writable. IDs accept decimal or 0x hexadecimal. Reads use Get Attribute Single (0x0E); writes use Set Attribute Single (0x10). Writable defaults off. Obtain the correct identifiers and scalar type from the device manual; discovery identifies devices but cannot infer every device's object model. Structured attributes, assembly payloads, and cyclic I/O require a device-specific adapter and are not supported by this generic scalar interface. All protocol types share the existing cache, source-level polling, actions, and events. A protocol change on a source with imported tags is rejected to preserve their address interpretation; remove its unused tags or create a new source instead.


### Permanent tag identities

Tags now have an immutable id and a separate name. New tags receive generated ids; existing tags migrate by retaining their original ids and adding their original names as display names. Bindings, actions, events, tag operands, polling leases, and cached values continue referencing ids. The same tag name can appear in different sources; duplicate names within one source are rejected case-insensitively. Duplicate device addresses within a source remain blocked.

Memory and SLC tag names can be changed in Edit without rewriting page references or device addresses. Logix tag names come from discovery and stay read-only; generic CIP names remain fixed for now. Tag Selector options and editor rule descriptions include the source name to distinguish identically named tags. Source Edit/Remove buttons are side by side; Usage can grow to 220 pixels before scrolling, and the repeated Tags line has been removed.


### Source list and type selection

Data Sources displays Driver \ Name, Current status, Tags, and row actions. Protocol sources are labeled PyComm3 Logix, PyComm3 SLC, or PyComm3 CIP. Tags lists their display names in a scrollable area; source usage is still checked internally to block unsafe removal. Edit locks Type and hides Auto Select while any tags belong to that source, matching backend protocol-change validation. Product hints below Type update with the chosen family. Tag rows use a compact 20-pixel indent beneath each source header.


### Live subscriptions and filtered batch requests

LiveSubscriptions in static/live-subscriptions.js tracks the union of tags used by the runtime page and open popups per browser tab. Bindings, action targets, event source/target tags, and comparison operands are grouped by source. Each source has one non-overlapping POST values/batch loop using its Live interval; Memory defaults to 500 ms. Opening/changing views fetches immediately. Popups add/remove tags automatically; shared tags remain while another view needs them. Actions do not force extra requests.

Batch responses contain only requested tags belonging to that source. Real-driver reads use the shared cache; Memory values are local. Tag timestamps prevent older replies replacing newer samples, and replies from removed subscriptions are discarded. There is no SSE/WebSocket connection or fixed runtime value timer. Management screens no longer request event status or control appearance. The Live-interest heartbeat maintains polling leases; leaving live mode or hiding a tab releases interest.

PLC polling and browser requests remain independent, so a display can trail a completed device poll by a browser interval. Runtime event evaluation lives in static/visual-events.js. This update changes no stored configuration format; keep v51 and your data folder for rollback. Run node tests/live-subscriptions.mjs and node tests/visual-events.mjs for frontend checks.


### Device write access

The HMI no longer has a Writable checkbox or its own per-tag write restriction. Legacy writable fields are ignored, so stale HMI settings cannot block valid device writes. Memory tags accept writes. Protocol actions attempt the write, and device errors are returned to the operator. Numeric type/value validation remains in place. Logix discovery and imported tag details show PLC-reported access as informational metadata only; changing PLC access does not require changing an HMI permission setting.


### PyComm3 driver naming

The driver is named PyComm3, with CIP, SLC, and Logix modes. Its code is in hmi/pycomm3_logix.py and hmi/pycomm3_modes.py; tests and documentation use the same naming. Existing stored driver keys migrate automatically to pycomm3 while preserving source IDs, tag IDs, bindings, settings, and pages. The external pycomm3 dependency retains its original package name and license. For a clean update, extract the release into a fresh directory and copy the existing data folder before starting it. Keep a pre-update database backup when rolling back to older releases that use the legacy driver key.


Each source group on Tags includes aligned Name, Object / Address, Usage, and Actions column headers. On narrow screens the tag table scrolls horizontally to retain column alignment.


Tag column labels depend on source mode: PyComm3 Logix/CIP show Read/Write with informational Read Only or Both access (Unknown when metadata is unavailable). SLC shows Address with its data-file address; Memory retains Object / Address.

### Request logging

All HTTP access logs are combined into one timestamped report per second while requests arrive. Each report shows method totals and counts per method/path, with HTTP error status counts when present. Query strings are omitted. Idle seconds are silent. Server diagnostic errors still print normally. This changes logging only, not request frequency.

### Memory tag identity

Memory tags need only a name and source. Each new tag receives a permanent ID that also serves as its internal Memory address. Add/Edit dialogs omit Object/Address for Memory. Renaming preserves identity and value. Existing Memory addresses are retained without migration. Memory values remain in-process and reset when the server restarts.

## Sheet sources

Install the optional formula engine using the same Python that runs the HMI, then restart:

```powershell
python -m pip install -r requirements-sheet.txt
```

Open **Sheets** from the application menu and use **+ Add sheet**. Choose a name, filename, and Background/Live polling intervals (defaults 20/0.5 seconds; limits 0.1–60). A `.sheet.json` suffix is added if needed. Files live under `data/sheets/`; filenames cannot contain folders. One source owns each filename. Editing the filename renames its file while preserving tags and contents. Deleting a sheet on the Sheets page moves its file into `data/sheets/.trash/`. Referenced sheets cannot be deleted. Back up the entire `data/` folder, including sheets and SQLite configuration together: formula references use permanent tag IDs stored in that database.

Use **Open** on the Sheets page to edit the fixed A1:D15 grid. There is no Save Sheet button. Enter saves and validates the current draft. Selecting another cell or closing with unsaved changes asks Save and Continue or Cancel; Cancel keeps editing. Close is at the bottom right. Select a cell, enter text, a number, or a formula in the top field, then press Enter or confirm saving when changing cells. Calculated values update after saving; validation or request failures keep the draft open. Formula errors must be corrected before continuing. Closing/reloading the browser itself uses its standard unsaved-changes warning. Prefix a numeric-looking value with an apostrophe to keep it as text. The **Insert Tag…** button uses the shared picker to insert a TAG expression. For example:

```text
A1: =TAG("PLC1\Temperature")
B1: =A1*1.8+32
C1: =IF(B1>100,"Hot","Normal")
A2: =SUM(A1:B1)
```

Cell references and rectangular ranges stay within A1:D15; absolute references such as `$A$1` are accepted. To reference a different sheet, import/select that cell and use `=TAG("Sheet2\A2")`. TAG reads a source tag; it never writes back to that tag. Older cells outside A1:D15 remain stored and existing references continue to work; new cells are limited to A1:D15. Source/tag renames preserve saved bindings and refresh the displayed formula path. Manually typed TAG paths must identify an existing tag; the picker imports a Sheet cell on Confirm when needed.

Supported functions initially: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, IFERROR, AND, OR, NOT, ABS, ROUND, ROUNDUP, ROUNDDOWN, LEN, LEFT, RIGHT, MID, CONCATENATE, CONCAT, TRIM, UPPER, LOWER, plus arithmetic/comparison operators and `&` for concatenation. This is a small sheet engine, not full Excel compatibility or XLSX import. Invalid formulas, missing/bad-quality inputs, and circular references display #ERROR with details on hover. Bad source quality propagates even when a formula uses IFERROR.

Sheets have their own management page and are hidden on Data Sources and Tags. In any shared Tag Selector, choosing a Sheet source displays its read-only grid. Select a cell and Confirm; its permanent tag name is its coordinate, and its path is `Sheet1\A1`. Cells can be imported once per source. The picker refreshes at that source's Live rate and releases its interest when closed. The sheet editor uses the Live rate while open too. Hidden tabs pause sheet requests.

Input cells accept numeric writes through existing button actions and text/number edits through the sheet editor. Formula cells reject ordinary tag writes: change the formula explicitly in the editor. Input values and formulas persist in the sheet file. Derived values are recalculated server-side from shared cached samples after source reads; this does not issue extra PLC reads. Normal Sheet tag polling and browser batches use the Sheet source's intervals. Viewing a sheet tag or picker also promotes its upstream dependencies to their own sources' Live intervals. Otherwise upstream tags use Background. Shared cache feedback, not a commanded PLC value, drives calculations.

Sheet columns are 20% narrower. Selection fills the full cell. With a cell selected in the editor, typing starts a replacement value/formula and focuses the formula field; Enter saves. Typing is disabled in read-only pickers.

### Sheets management and transfer

The application menu includes **Sheets**. Its landing page provides filtering, Add, Open, Settings, Export, and Delete, plus Import at the top. Reference lists link to saved pages/controls and identify dependent sheets. Used sheets cannot be deleted. Open edits values/formulas using the existing save-on-leave confirmation; Settings saves the name, filename, and polling intervals.

Export downloads native `.sheet.json` containing text, formulas, rates, and external tag paths (no machine-specific tag IDs). Import creates a new sheet with editable name/filename/rates; by default it proposes a copy. It does not overwrite existing files. Referenced external sources/tags must exist under the exported names. Sheet cell dependencies are created internally as needed. Self references are rebound to the imported sheet. Invalid imports roll back without leaving a partial sheet. Native exports/imports retain hidden legacy cells from A1:E20. XLSX/CSV import is not included.

Sheet cell tags are internal bindings, not a separate user-managed list. The shared picker creates them on Confirm and reuses existing IDs. Bindings referenced by page actions, visual events, or another sheet must remain to preserve those references. Unused bindings can be removed without altering cell contents. Back up data before cleanup; deleting an internal binding that a draft still uses can invalidate that draft.

Grid size (Off/5/10/20) and style (Hide/Lines/Dots) are stored per page when using Save Page. They restore when reopening the page or restarting. Existing pages default to 20/Lines. The Sheet Tag Selector uses a compact grid panel without its redundant cell caption/subtitle; the selected cell, path, and value remain in the footer.

The Sheet editor Function dropdown beside Insert Tag lists the supported formula functions supplied by the backend. Selecting a function inserts NAME( at the cursor (adding = for a new formula), focuses the input, and places the caret after the opening parenthesis. The normal filename/grid subtitle and save-success line are hidden; validation and request errors remain visible.

While the Sheet formula input is focused and begins with =, clicking a cell inserts its address at the cursor (replacing selected input text) and returns focus to the input. The edited cell stays selected and no navigation/save is triggered by reference clicks. Enter validates/saves and returns focus to the edited cell, ending reference-entry mode. Normal selection and save-on-leave behavior continue outside formula entry; read-only pickers never insert references.

The Sheet save confirmation includes Revert on the left, alongside Cancel and Save and Continue. Revert restores the selected cell to the editor’s last saved contents and keeps it open without writing. Sheet Boolean tag inputs and formula results are numeric 1/0, so range SUM, AVERAGE, COUNT, and other numeric functions include them. This changes Sheet calculations only; native device Boolean types are retained. Text strings containing the words true/false remain text.

PyComm3 cooldown errors are idempotent: the local-interface annotation appears once, and polls during a retry delay do not reset the reconnection deadline. Sheets hides the polling summary column; rates remain editable in Settings. Sheet row actions remain on one line.

### Text Editor dialog

Text controls now have an Edit button under Content in Properties. It opens a multiline Text Editor with font face, size, Bold/Italic, horizontal/vertical alignment, Back/Fore colors and opacity. Save applies all changes to the page draft as one undoable edit; Cancel changes nothing. Use Save Page to persist the page. Text, font, alignment, and color fields have moved out of the control sidebar; page/image background properties remain there. Labels offer Rounded Corners in Layout. Multiline label/button/numeric-display text preserves line breaks in editor and runtime. Indicator is removed from the toolbox; existing saved indicators still render for compatibility.

Set Content visual events are available on labels, buttons, and numeric displays. Enter literal, optionally multiline content; matching events replace the entire display using its existing formatting. An empty value clears it. Normal content returns when the condition no longer matches or its source is unavailable. Later matching content events take precedence.

Set Content now uses Edit Content to open the same Text Editor as the control. The event stores its own text, font face/size, bold/italic, alignment, and Back/Fore colors including opacity. These apply together while the condition matches and restore to normal when it does not. Older text-only events remain supported.

The Text Editor includes Insert Tag at the top right. Select a tag to insert `@{Source Name\Tag Name}` at the caret (or replace selected text), then continue typing. Edit mode keeps the literal reference; runtime pages/popups substitute the latest cached value using the usual per-source Live batches. Multiple references are supported, including Set Content event text. Booleans display as 0/1; unavailable or unknown tags display an em dash. Inline references count toward tag usage and are stored against stable tag IDs when the page is saved.

The toolbox now offers Image, Label, and Button. Use inline tag text in labels for numeric values; existing saved Numeric Display controls still render. Label Rounded Corners appears immediately beneath Visible. Events have Move Up, Move Down, and Duplicate icon buttons beside Add/Remove, with descriptive tooltips. Duplicates are independent and inserted below the original. The selected event stays selected while reordered; later matching events continue to take precedence. Changes participate in Undo and Save Page.

In Select Tag, Sheets is an expandable group at the top of the Sources list. Expand it to choose an indented sheet and display its read-only cell grid. All Sources and device sources appear below the group; selecting one returns to device tags. An existing sheet-cell selection automatically expands the group and opens its sheet. Switching sheets releases the previous sheet polling interest.

The Tag Selector retains its standard width and content viewport when switching between device tags and sheets. Sheet grids scroll horizontally and vertically inside that viewport. The footer shows the selected Source\Tag once in bold, followed by its current value.

Value Input is a mouse action with a Tag, Minimum, Maximum, and Allow Decimal setting (defaults 0, 100, off). In live mode it opens a custom numeric-entry dialog showing the tag path and limits. Write validates and writes the entered value; Cancel/Escape writes nothing. Invalid characters and pasted text are rejected; bounds and whole-number requirements are checked in both browser and service. Feedback still follows normal polling. In the Actions inspector, Tag now follows the Action dropdown.

Value Input has an optional Prompt above Minimum/Maximum, with Value Input as its placeholder. The popup uses the prompt as its title, defaulting to Value Input when blank. Minimum/Maximum appear directly below the title; there is no separate tag or prompt line.

Select the page itself in Explorer to edit its Actions and Events. Page actions use Page Open and Page Close triggers with the same action options as controls. Each displayed page instance runs its open/close actions once; this includes popup close buttons, Escape, navigation, and event-driven popup closure. Closed browser tabs/processes cannot reliably finish network writes, so these are view lifecycle actions rather than shutdown guarantees. Page events offer Set Colors (Back and Fore) and Close (Popup Only). Close is ignored on the main page. Later matching visual rules take precedence and normal page colors return when conditions stop matching. Page rule tags join the usual per-source live batches and count toward usage/deletion checks.

Navigate to Page and Popup Page are available on controls only. Page Open/Close actions exclude them, and previously saved lifecycle navigation/popup actions are skipped.


BACnet/IP (BAC0)

Install the optional driver dependencies using `python -m pip install -r requirements-bacnet.txt`, then restart. This release pins BAC0 2026.7.25 and BACpypes3 0.0.110. Memory/PyComm3/Sheet do not require BAC0.

Choose BACnet/IP (BAC0) in Add Source. Select this computer's local IPv4 interface, its subnet prefix (for example 24), BACnet UDP port (default 47808), and a unique local BACnet device instance. A blank Discovery Target uses local broadcast; enter an IP[:port] for a particular device, or a BACnet network:address reachable by the stack. Source polling defaults to Background 20 seconds / Live 0.5 seconds, with the same 0.1–60 second limits. Test Connection waits for devices to answer Who-Is. Discovery/write settings include instance-range limits, discovery wait, request batch size, write priority (default 16), and optional BBMD address/registration TTL. Broadcast discovery needs the correct interface/subnet; cross-subnet deployments can use BBMD foreign-device registration. Matching sources/tests share a BAC0 session; different sessions need distinct local interface/UDP-port bindings.

On Tags, + Add Tag opens the BACnet browser. Device rows show Instance ID - Object Name; expand one to load its objects. Object rows use Object Name, with the identifier alongside. Select an object to read PV, Event State, and Units. Missing properties are disabled. Add each supported property once; multiple properties may retain the same Object Name because their permanent IDs/addresses differ. Refresh Devices refreshes discovery/object names; Load More retrieves further cached object rows. The filter applies to loaded object names/identifiers.

A tag path is `BacNet1\1443213\OBJECT_ANALOG_VALUE:200\presentValue` (or `eventState` / `units`). Numeric identifiers drive reads/writes; Object Name is a fixed label. These paths also work in the shared picker, inline @{...} content, and Sheet TAG formulas. Present Value supports numeric writes, including binary 0/1, at the configured write priority; the device accepts or rejects them. Event State is numeric feedback and Units is readable text. Event State/Units tags are read-only. Writes await the response, with feedback arriving through normal polling rather than optimistic updates.

Polling uses ReadPropertyMultiple in bounded batches, with single-property fallback for devices that do not support it. Object-list discovery falls back to indexed reads when segmentation is unavailable. BAC0 does not independently poll registered devices/points: this application's scheduler controls Live/Background rates. Disconnection errors appear in source status; failed polling backs off before retrying and re-resolves device instances. Tested with a real BAC0 loopback server (discovery, object/property reads, batch reads, analog/binary writes, missing properties, cleanup/reconnect), plus browser and regression tests. Physical controllers and site-specific BBMD/router configurations still need a site test.

For a repeatable local UDP smoke test after installing the BACnet dependencies, run `python tests/bacnet-loopback.py` from the project folder. It uses only 127.0.0.1 on UDP ports 47839/47840 and does not contact equipment.

BAC0 API references: [startup/interfaces/BBMD](https://bac0.readthedocs.io/en/latest/connect.html) and [read/readMultiple](https://bac0.readthedocs.io/en/latest/read.html). Offline devices use bounded probes and cooldown; unsupported RPM is remembered for single-property fallback.

Shapes appear beneath Controls: Square, Ellipse, and Triangle. They support mouse actions and Show/Hide/Set Colors events, drag/resize, ordering, copying, and Undo. Back is the fill; Fore is the stroke, with independent opacity. Stroke Width is in pixels (0 hides it). Square Edge Diameter controls rounded corners. Ellipse fills the entire bounding box. Triangle has a Rotate 90 degree property button, rotating within its existing bounds. Shapes have no text content or font properties; place a label over them for text. Existing saved circles use the ellipse renderer.

Polyline is an open line under Shapes. Select it and drag its point handles to reshape it. Add Point inserts a midpoint on its longest segment; click a point handle and use Remove Selected Point to remove it (minimum two points). Finish Editing Points switches to the normal move/resize handles; Edit Points returns to point editing. Points scale with the bounding box, and edits support Undo and saving. Fore controls the line color and opacity; Stroke Width controls thickness.

Right-click a control on the canvas or in Explorer for control commands, including Pin/Unpin. Pinned controls show a pin in Explorer and let canvas clicks pass through without selecting or dragging them. Select them through Explorer to edit their properties, actions, or events. Pinned controls are ignored by canvas right-clicks as well, allowing commands on controls underneath. Unpin is available only through Explorer. Pins are saved with the page and support Undo.

In the sheet editor formula input, Escape restores the selected cell to its last saved contents and clears cell selection and input focus without saving or closing the editor. The confirmation dialog Revert does the same; click a cell to resume editing.

Sheet cells with TAG(...) formulas display bold; good tag values display green, and errors remain red. Arrow keys move the selected cell within A1:D15 when a cell has focus. Arrow keys in the formula input retain normal text-caret behavior.

Page parameters: select the page in Explorer and use Configure Parameters beneath Name. Add, remove, or rename parameters with descriptions; Save applies the dialog draft and Save Page persists it. Stable IDs preserve connections across renames. The page editor tag picker lists Parameters before Sheets, with paths such as Parameters\PV, usable in actions, events, and inline text. For navigation and popup actions choose a destination, then Connect Parameters and assign tags using the shared picker. Connections belong to that action; each live popup resolves its own independent bindings and polling dependencies. Parent parameters can be forwarded into nested popups. Unconnected parameters display unavailable values and their write actions are skipped. Opening a page directly has no incoming connections. Connection tags are included in usage checks to prevent deleting referenced tags/sources.

Connect Parameters uses compact name/description and tag-picker rows with a scrolling list. Edit Page above Connect Parameters opens the destination in the editor. Leaving a dirty editor page shows Cancel, Discard, and Save & Continue; saving must succeed before navigation proceeds. Browser refresh/closing still uses the browser unsaved-change warning.

In the sheet editor, Delete on a focused cell clears and saves it. Right-click a cell for Cut, Copy, and Paste. These copy the raw text/formula exactly, using an internal clipboard shared between sheets in the same browser tab; Cut and Paste save immediately. Formula references are preserved as written. The read-only picker does not offer these edits.

The Logix Add Tag browser shows the selected Source\Tag path and a current-value preview. Selecting a scalar tag performs one read without creating a tag or writing to the device. Select it again to refresh the preview; no continuous preview polling is started. Failed reads show unavailable. Refresh PLC Tags stays at the bottom left and Confirm adds the selected tag.

Numeric Display is available under Controls. Its Content section contains Tag and Display Digits (0–15 decimal places, default 2). It displays only the numeric tag value; formatting never changes the tag. Unavailable/non-numeric samples show a dash. Font, alignment, colors, actions, and visual events remain available; Set Content is not supported.

Label/button appearance events use Set Content for text, fonts, alignment, and colors; Set Colors remains available for numeric displays, shapes, images, and pages. New Set Content events copy the current control content and formatting. Existing label/button Set Colors events are adapted to Set Content in the editor. The shared tag picker remembers source, filter, selected tag, Sheets expansion, selected sheet cells, and scroll position in this browser. A field’s existing tag takes precedence over the remembered selection.

Logix tag discovery lists programs first, followed by controller tags. Both Logix and BACnet Add Tag dialogs use Save. BACnet uses one expandable Device → Object → Property tree, lazy property reads, a selected property path and current-value preview, and Refresh Devices at the bottom left. Existing tag identities and paths are unchanged.

BACnet discovery labels devices as Device Name [instance]. The device object beneath each device is labeled Device Properties; its numeric object identifier and tag paths remain unchanged.

BACnet property browser: devices/objects are on the left and an object's discovered properties are on the right. Selecting an object discovers and caches its properties (30 seconds on the server, until Refresh Devices in the dialog). Discovery uses propertyList, indexed propertyList reads, then ReadPropertyMultiple/all; older devices fall back to readable standard properties with a message when complete discovery is unavailable. Scalar properties can be saved as tags; arrays, bit strings, and structures have preview-only display. Existing PV/Event State/Units paths remain valid. Added tags alone receive normal polling. Numeric actions may attempt writes to any saved BACnet property; the device/library enforces type and access and errors report the property and reason. Command priority is supplied for Present Value writes only. No whole-device property scan runs in the background.


### Combined Data Sources & Tags management
The application menu opens Data Sources & Tags. Select a source on the left to browse its tags and connection details, then select a tag to see its cached value and clickable page/sheet references. Search matches source names, driver names, tag names, and addresses. Add/Edit/Remove actions use the existing driver-specific dialogs and reference checks. Status dots and the selected tag value refresh once per second using cached data; browsing does not promote tags to Live polling. Sheets remain on their own page. Existing #tags bookmarks open the combined manager.


### Pages and Sheets preview managers
Pages and Sheets now use the same selection-and-details layout as Data Sources & Tags. Pages show a scaled static preview, references, and a Parameters tab; preview controls never execute actions. Sheets load a read-only snapshot once per selection, with selected-cell formulas and references; opening a sheet still uses the existing editor. Both screens retain filters, management actions, and reference-based deletion protection.

Pages support JSON Import and Export. Exports include layout, controls, actions/events, parameters, named tag and destination-page references, and embedded image assets. Import always creates a new page with new page/control/rule/parameter IDs. Referenced tags are matched by Source\Tag Name; other destination pages and their parameters are matched by name. Self-navigation is rebound to the imported page. Missing or ambiguous dependencies reject the import without adding a page. Source devices, tags, and linked pages are not imported automatically. Existing pages are never overwritten.

Sheet landing previews do not start a Live polling lease or a refresh timer. Select the sheet again to reload its preview. Sheet editors and tag pickers retain their normal live updates.


### Level Indicator
Level Indicator is a rectangular read-only tag display. Content includes Input tag, Minimum, Maximum, and Bottom to Top / Top to Bottom / Left to Right / Right to Left fill direction. Values are clamped to the configured range; unavailable/non-numeric readings show an empty outline. The editor uses a half-full preview. Back supplies fill color and Fore supplies outline color, with independent opacity. Stroke Width and Edge Diameter follow the rectangle controls. Standard mouse actions and events are available; Set Content is not. The binding participates in normal per-source live polling and usage references.

Level Indicator also has an optional Show Value checkbox in Content. It displays the clamped fill percentage, rounded to a whole percent, at the center using Fore color. Bad/unavailable data shows a dash instead of a percentage.


### Symbol (SVG)
Symbol is a separate SVG-only image control. Upload an SVG in Content, choose Fit, Fill, or Stretch, then set Stroke Width in Shape. Back recolors visible fills and Fore recolors visible strokes; intentional fill/stroke none stays transparent. Color opacity is supported. Set Colors events can change both colors and optionally Stroke Width, with the base style restored when the condition clears. Symbols use the existing image database and page import/export, and their geometry is cached in the browser. Sanitization retains supported vector geometry, simple style rules, local clipping/masking, and text while removing scripts, embedded HTML, external resources, and unsupported SVG features. Gradients are flattened to the chosen solid fill. Symbols have normal control mouse actions and events, without Set Content.


### Login session duration
Administration > Users & Groups > Login Sessions provides fixed expiry (default 8 hours), inactivity expiry, or no automatic expiry. Duration is in hours. Settings persist in SQLite and apply to existing sessions. Inactivity measures trusted pointer, keyboard, and wheel interaction across the tab; data refresh requests do not renew it. Activity reports are throttled to once per five seconds. Restarting the server or logging out still ends the session. The browser cookie has a one-year maximum lifetime even with no automatic server expiry.

### MQTT (Paho)
Install `python -m pip install -r requirements-mqtt.txt`, then restart the server. Add an MQTT (Paho) source with the broker hostname/IP, TCP port (1883 normally, 8883 for TLS), optional username/password, and an optional unique client ID. TLS uses system trusted certificates. MQTT 3.1.1, QoS 0/1/2, retained publishes, connection testing, and automatic reconnection are supported. Do not reuse a client ID across running sources/clients.

Add tags by giving each a display name and exact topic such as `plant/pump/speed`. Topics are case sensitive. Edit can rename or retarget the topic while preserving the tag ID. Only configured topics are subscribed; removing tags unsubscribes. MQTT does not provide a universal topic directory, so this initial version uses manual topic entry. Payloads can be JSON numbers/booleans/strings or plain UTF-8 text. Objects, arrays, null, binary data, and non-finite numbers report bad quality. JSON field extraction and separate command/feedback topics are not included in this initial version.

Incoming messages stay in the driver's cache. The source Live/Background intervals govern snapshots into the shared HMI cache, not broker message delivery. A tag waits for its first message; retained broker messages can provide an initial value. Disconnect clears cached driver values and reports bad quality on the next scheduled refresh. Writes publish numeric action values to the same topic, using source QoS and Retain settings, and wait for Paho's delivery result. Successful publication is not device confirmation; displayed feedback still waits for an incoming message and refresh. The Administration status page shows received/published message counts and configured subscriptions.


MQTT Add Tag now includes an expandable topic tree, current-value preview, discovery filter (default `#`), local search, and manual Topic/Tag Name inputs. Refresh Topics starts a fresh discovery cache and replays retained messages. The browser reads discovery once per second while visible. Discovery uses a separate randomly identified MQTT client with the same broker credentials; it cannot change saved tag subscriptions. Each source allows up to four discovery dialogs. Each dialog holds up to 1,000 topics, previews up to 4,096 text characters, and skips topics over 512 UTF-8 bytes or payloads over 64 KiB. Additional unseen topics are ignored after reaching the cap, but existing values keep updating. Close/Save unsubscribes by closing the temporary connection; an abandoned dialog expires after approximately 10-15 seconds without requests. A hidden tab stops discovery updates and restarts discovery when visible. MQTT `#` does not match `$` system topics; use `$SYS/#` explicitly when appropriate. Broker permissions still govern visible topics. No message history or permanent discovery cache is stored.

Designer sidebars can be resized by dragging their inner edges. Widths are kept in browser local storage, independently of saved pages. Focus a divider and use Left/Right arrows for 10px steps (Shift for 30px). Explorer, Actions, and Events lists show a horizontal scrollbar when their labels exceed the available width. Native selection and context menus are preserved.

Click Polyline in Shapes to begin drawing. Click the page to add points, right-click to remove the last point, then Complete in the right sidebar (at least two points). Cancel abandons the draft. Points follow grid snapping and zoom. Completion calculates a stroke-padded bounding box and adds the line as one undo step; Save Page persists it. Existing point-editing tools remain available afterward.

While drawing a polyline, a dashed next-segment preview follows the mouse using the grid. After at least three points, hovering within eight screen pixels of the starting point highlights it green; clicking closes the line back to its first point and completes it. Complete still finishes an open line.

Polyline point handles use page coordinates rather than clamping to the old bounding box. Dragging a point refits the box while preserving all other page-space points. Finish Editing Points refits it again (including after point removal). Closed lines keep their repeated first/last point linked. Whole-control movement and resizing remain available after finishing point editing.

Polyline Shape properties include Fill when closed (off by default). Closed paths with at least three vertices use Back Color for fill when enabled; Fore Color remains the stroke. Open lines remain unfilled. Add Point and Remove Selected Point are visible only while Edit Points is active.

Point editing offers Add Before Selection and Add After Selection for neighboring segments. Closed-loop insertion wraps around the repeated endpoint. Open Polyline drops the closing segment and selects the last point. Continue Drawing is available at either open endpoint (backward at the first); it edits an isolated draft with the same mouse preview and click-to-close behavior. Right-click removes only newly drawn points. Cancel restores the original; Complete preserves the control ID, formatting, actions/events, and applies one undoable geometry change. Closed-line removal preserves closure and at least three distinct vertices; open-line removal preserves at least two points.

Selecting another control or the page automatically finishes polyline point editing and refits its bounds. Interacting with the same control properties keeps point editing active. Leaving the designer also finishes point editing.

Moving a polyline snaps its translation distance rather than its stroke-padded bounding-box origin. This preserves the grid alignment of existing points without distorting the line, including at page edges. Grid Off allows free translation.

The polyline designer boundary uses an inset box shadow instead of a layout border, keeping the SVG viewport identical to the saved geometry. Verified actual browser movement and rendered vertices at 100% and 75% zoom.

All SVG shape controls (rectangle, ellipse, triangle, polyline), Level Indicator, and Symbol now use layout-free editor boundary guides. Rectangle, ellipse, triangle, and Level Indicator viewport dimensions and zero offsets were verified in the browser at 100% and 75% zoom.

Shape and Level Indicator SVG geometry now updates throughout resize dragging, with preserveAspectRatio=none to prevent letterboxing inside a resized viewport. Large asymmetric rectangle/ellipse resize regression checks cover 800x160 geometry and stroke bounds. Triangle is no longer offered in the toolbox; legacy instances still render.

Designer zoom now supports 250% and 300%, including mouse-wheel steps. The designer context menu includes Go To > Actions / Events for the clicked control or page background. Shared tag fields offer right-click Copy Tag / Paste Tag and Ctrl/Cmd+C / Ctrl/Cmd+V while focused. This is an in-app, current-tab tag clipboard based on stable IDs, separate from text/image/control clipboards; deleted tags and parameters unavailable in the destination page cannot be pasted.

Rectangle, ellipse, and Level Indicator strokes are centered on their snapped geometry, matching grid-snapped polyline vertices. SVG overflow is visible so the outside half of the stroke is not clipped. Equal stroke widths align along shared grid coordinates; thicker strokes naturally extend farther to either side.

Changing polyline Stroke Width now preserves page-space vertices and refits the padded bounds with the new thickness. Layout fields update in place. Padding may extend beyond the page at boundary vertices rather than displacing those vertices; the page still clips runtime content normally.


### Users and Access
The existing single account is automatically retained as the first administrator. Administration > Users and Access lets administrators add/edit/remove users, assign Administrator access, assign multiple roles, and create/rename/remove named access roles. Passwords use salted PBKDF2-SHA256 hashes, never plaintext. New/reset passwords require at least 12 characters. Leave the password blank when editing to retain it. Password changes invalidate that user's sessions; deleted users lose access on their next request. The signed-in user cannot delete their own account, and at least one administrator must remain. Roles assigned to users or referenced by saved actions cannot be removed until those references are cleared.

Every action has an Access Roles picker. All selected roles are required; no selected roles means any signed-in user. Administrators bypass action role requirements. Navigation, popup, page lifecycle, and control actions are checked against their saved action IDs on the server. Writes reconstruct fixed action details from saved configuration; only a Value Input submission provides a new value (checked against its saved limits). Parameter tag connections remain per-instance. Role changes take effect server-side on the next request; reload the browser to refresh management/navigation UI after changing your own administrator status.

Non-administrators have runtime and page selection access. They cannot edit project configuration or manage accounts, roles, drivers, sheets, or session policy through the APIs. Access roles govern action execution and protected listbox index changes, not which pages or tag values a signed-in viewer may read. Listbox Content has its own Access Roles requirement for the built-in index write; User Changed actions keep their separate role requirements. Legacy write-style events (not offered by the current Events UI) remain administrator-only. Visual events continue to evaluate normally. Role IDs are stable across renames; page exports preserve role IDs, so moving a page to a separate installation requires reviewing/reconnecting its role requirements. No-role actions on existing pages remain available to signed-in users.

User settings include Kiosk Mode and Starting Page. Starting Page is applied after login, defaulting to the first saved page. Kiosk accounts can access live views only, with just username and Log Out in the top-right header; page navigation/popup actions remain available subject to action roles. The launcher, page dropdown, editor link, and management screens are hidden/blocked. Kiosk restrictions apply even when the account also has Administrator selected, and direct configuration API writes remain denied. Keep at least one non-kiosk administrator. An existing starting page that is later removed falls back to the first page.

Administrators in Kiosk Mode have an Exit Kiosk Mode button at the top left. It restores normal administrator access for the current session only, enforced by the server; non-administrators cannot use this endpoint. The saved Kiosk Mode user setting remains unchanged and applies again at the next login. To disable it permanently, exit kiosk and edit the user setting in Administration.

Listbox Content > Access Roles requires all selected roles to modify its index tag. Empty requirements allow any signed-in user; administrators bypass role requirements. Touchable still controls whether interaction is enabled at all. Without role access, the control remains live and follows read feedback, while mouse/keyboard writes are disabled. The server resolves the saved control and enforces its requirements before writing; client-supplied role lists are ignored. Roles used by saved listboxes cannot be deleted until their references are removed. Refresh the viewer after changing a user role assignment to refresh interaction availability; server-side revocations apply on the next request.

### Interface themes
Each user has a saved Light, Dark, or System interface theme. Set it when editing a user in Administration → Users and Access. System follows the browser/device appearance. System is the default, including the login screen; existing users are initialized to System once on upgrade. Kiosk users inherit their configured preference. Themes affect application panels and dialogs; page backgrounds, controls, images, symbols, and designer grid colors retain their configured appearance.

### Modbus TCP (PyModbus)
Install `python -m pip install -r requirements-modbus.txt` and restart. Add a Modbus TCP source with the device IP/hostname, TCP port (normally 502), Unit ID (normally 1), timeout, and background/live polling intervals. One source represents one host and Unit ID; multiple gateway devices can use separate sources on the same host. Test Connection opens the TCP socket only; Read Value in the tag dialog verifies a specific Modbus read.

Add a named tag using the device register map: choose coils, discrete inputs, holding registers, or input registers. All addresses are **zero-based offsets**. For a conventional map, holding register 40001 means offset 0, 40002 means 1; input register 30001 means 0; coil 00001 means 0; discrete input 10001 means 0. Devices sometimes document offsets directly: follow that manual and do not subtract twice. Modbus does not normally advertise names, addresses, or data formats, so there is no automatic tag discovery.

Coils/discrete inputs display 0/1. Registers support UINT16, INT16, UINT32, INT32, FLOAT32, and FLOAT64, with byte order within each 16-bit register and word order across registers configured per tag. Default big/big is high byte/high word first. Multi-register values occupy consecutive addresses. No scaling is applied; use Sheets for calculations. Adjacent/overlapping requested values in the same area are read together without crossing unconfigured gaps, capped at 125 registers or 2000 bits per request.

Coils and holding registers accept writes (FC5, FC6, FC16); discrete inputs and input registers return a clear read-only error. Integer writes require whole numbers within range; floats must be finite. Device exceptions and connection failures report bad quality and readable errors. The next scheduled poll reconnects as needed. All communication for a source is serialized between polling, previews, and writes. Source/tag IDs, tag picker paths, inline references, Sheets, live polling, and action access roles use the existing framework. Editing a tag name or address preserves its ID. Server Status includes Modbus request counts.

Driver implementation follows the [official PyModbus client API](https://pymodbus.readthedocs.io/en/stable/source/client.html). Modbus RTU, RTU-over-TCP, strings, and register bit extraction are not included.

Server Status includes current host physical RAM used/total, usage percentage, and available RAM on Windows and Linux (including Raspberry Pi). It uses native OS counters without an additional dependency, and displays Unavailable if counters cannot be read. Used RAM is total minus available RAM. Modbus tag dialogs hide all register-format fields for coils/discrete inputs, and hide word order for single-register 16-bit values.

The default interface theme is System, including the login screen. On first launch of this version existing user preferences are initialized to System once; users can then be assigned Light, Dark, or System in Administration > Users and Access. Theme selection no longer appears in the header. The header clock uses the viewing device’s local date and time and updates once per second without server requests. Page previews can be clicked (or activated with Enter/Space) to edit. Designer control and shape tools use SVG icon buttons with hover tooltips. The designer controls share the single main header row. Live views no longer show a page selector.

The web interface suppresses native browser context menus throughout the application, including dialogs, images, links, and text inputs. Application context menus remain available in the designer, Explorer, tag fields, and editable sheet cells. Text selection is restricted to text/number inputs, textareas, and editable text; keyboard editing and clipboard shortcuts in these fields continue to work.

The single header row includes Save & View, Save, Undo/Redo, Grid, Style, and Zoom, separated into groups. It uses the current theme and icon styling, and scrolls horizontally on narrow screens instead of wrapping. No traditional menu has been added.

The application header is one row on designer and live pages. The Oops! All Buttons text is removed from the header. Designer Save & View, Save, and Undo/Redo sit to the left of the centered date/time; Grid, Style, Zoom and the account sit to the right. Tool groups scroll horizontally when needed instead of creating a second row.

Every authenticated header uses a User: Username button. It opens a compact account dialog with username, Administrator/Standard User level, assigned role names, and Log Out. Profile details refresh on opening. Logout preserves the existing unsaved-page confirmation. Kiosk users use the same account popup. A vertical separator appears after the designer view tools before the user button.

All application headers have the same 64px height. New SVG imports through Symbol controls are sanitized and saved with geometry bounds for ordinary artwork. Clip/mask artwork uses a bounded offscreen raster to measure painted extents; the saved asset remains SVG. Ordinary existing symbols also normalize their geometry bounds once when rendered. Fit still preserves aspect ratio and may letterbox if the control proportions differ; Stretch fills the bounding box. This removes empty artboard space, not actual drawn background rectangles.

Symbols use non-scaling strokes: Stroke Width remains in page pixels when the SVG is stretched, including non-uniform scaling. Normal designer/page zoom still zooms the whole page. Ordinary symbols use exact geometry bounds rather than painted-stroke bounds, measured once per rendered instance; existing symbols also gain this behavior. New imports save these geometry bounds. Stroke centerlines meet the control edges, and strokes may extend half their thickness outside them, matching other shapes. Horizontal/vertical line symbols are centered on their zero-size axis. Use Stretch (or a matching aspect ratio) to align extents with the control bounds; internal connection points still depend on the SVG geometry and control dimensions. Clip/mask artwork retains painted crop bounds; Fill (crop) continues to clip to the control viewport. Matching color, stroke width, and compatible line caps allow a polyline to continue an SVG line.

### Basic LibreCAD DXF symbols
Install `python -m pip install -r requirements-dxf.txt`, restart, and use Symbol → Choose SVG or DXF. Import a flat 2D ASCII DXF drawn in model space at Z=0. Lines, circles, arcs, ellipses, splines, 2D polylines (including bulge arcs), SOLID/TRACE faces, and basic internal blocks are supported. DXF is converted once to sanitized SVG; live viewing uses the existing Symbol rendering, fit modes, colors, non-scaling strokes, and geometry alignment. CAD units scale to control bounds. CAD colors, lineweights, polyline widths, and linetypes are replaced by Symbol styling.

Linework uses Fore Color. Closed polylines and circles remain outlines. Use a solid hatch wherever Back Color should fill a region. Hatch holes use even-odd filling and respect hatch boundary/style flags. Fills are drawn before linework to preserve outlines. SOLID/TRACE faces also use Back Color. Add separate boundary linework for a Fore Color hatch outline. Off/frozen layers and invisible entities are ignored; paper-space layouts are not imported.

Text, dimensions, patterned/gradient hatches, external references, non-flat geometry, and unsupported visible entities produce clear errors rather than partial drawings. Remove them or explode complex entities before export. Limits: 5 MB, 4000 expanded entities, 8 block levels, 100000 path segments. Curves may use cubic Bézier approximations. The filename is retained as a label, but stored/exported assets are SVG and do not need DXF conversion again.

Uses the [official ezdxf path API](https://ezdxf.readthedocs.io/en/stable/path.html) and [hatch boundaries](https://ezdxf.readthedocs.io/en/stable/dxfentities/hatch.html).

### Symbol Spin event

Symbols have a Spin event with the standard event comparisons (including ranges and tag operands) and a speed from 0 to 60 RPM (default 10). In live view, a matching condition spins clockwise around the control center. An unmatched condition, unavailable feedback, or zero RPM pauses at the current angle; restarting resumes from there. The angle lasts for the open view and resets when the view is reopened. Later Spin events take precedence. Animation runs in the browser without additional polling.

### Server error history

Administration > Server Status shows HTTP errors (method, endpoint, status, message), driver startup errors, and failed polling batches. Identical origin/message pairs are grouped with an occurrence count and first/last times. The newest 200 distinct errors are kept in memory for the current server run; restarting clears this history. Request bodies, passwords and URL query strings are not logged. The log is administrator-only.

### HTTP connection bursts

The threaded HTTP server accepts up to 128 queued connections instead of the standard queue of five. This avoids connection retry pauses when browser module loads, login data requests, and independent live source timers arrive together. Device polling rates and browser refresh intervals are unchanged.

### Live browser cadence

Per-source browser timers include the elapsed request, JSON parsing, and synchronous paint time in their configured interval. A slow response never creates overlapping or accumulated catch-up requests. Failed requests retain a full interval before retrying. New live-view batch loops start without waiting for interest registration to return.

### Move-only designer groups

Ctrl-click controls on the canvas or in Explorer, then right-click and choose Group > Create Group. Explorer lists members under their group; double-click the group to expand or collapse it. Select the group in Explorer and drag anywhere inside its bounding box to move all members with one grid-snapped delta. Select a member in Explorer to move or resize it individually while working within a group. Groups have no resize handles; controls remain individually selectable, movable, and resizable. Pinned controls remain protected from direct canvas selection but move with their group.

The Group submenu also provides Add to Group, Remove from Group, and Ungroup. Ungroup keeps controls and their positions. Delete Group deletes its members after confirmation. Cut, Copy, Duplicate, and Paste on a selected group include members and group events with fresh IDs. Individual control copies leave their former group. Cross-page group pastes reuse matching named page parameters, adding referenced parameter definitions when missing.

Groups support a name, base visibility, and standard Show/Hide conditions. Group Hide takes precedence over member visibility; Group Show preserves each member's own visibility rules. Group event tags participate in polling, parameters, usage references, and page import/export. Group edits and movement participate in Undo/Redo. Groups cannot contain other groups. Each group is one page layer with its own member draw order. Order commands on a member change its order only within that group; Order commands on a selected group change its page layer. New members go to the front of their group. Existing interleaved layouts consolidate a group at its previously frontmost member. Explorer follows the same back-to-front layer order.
