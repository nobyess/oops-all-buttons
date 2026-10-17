# Extending the framework

## Add a control

In `static/controls.js`, add an entry to the exported `controls` object. It automatically appears in the toolbox. Its `props` automatically populate the property inspector. Defaults are saved on creation.

```javascript
temperature: {
  label: 'Temperature',
  bindable: true,
  props: {
    ...common,
    suffix: {label: 'Suffix', type: 'text'}
  },
  defaults: {text: 'Temperature', width: 180, height: 50, suffix: '°F'},
  render(el, control, context) {
    const sample = context.bindingValue;
    el.textContent = sample?.quality === 'good'
      ? `${control.text}: ${sample.value} ${control.suffix}`
      : `${control.text}: unavailable`;
  }
},
```

The render function receives a content element inside the control wrapper, the effective control properties, and context containing `editing`, `values`, `bindingValue`, `appearance`, and `execute(control, trigger)`. Use `textContent` for user-entered strings. Render must not write tags as a side effect. The wrapper dispatches standard mouse triggers for every control. Avoid dispatching them again in custom controls. The editor owns geometry, visibility, colors, and resize handles. Use an optional `update(element, control, context)` function to preserve interactive DOM nodes across live refreshes; Button demonstrates this.

There is no common Tag property. Set `bindable: true` on controls that display a tag value; their optional Display Source Tag picker appears on Events and stores `control.binding.tag`. Read the sample from `context.bindingValue`. Existing control tag properties migrate automatically.

## Reuse the Tag Selector

Import `tagPicker` for a clickable field or `openTagSelector` for a standalone popup from `static/tag-selector.js`. Supply `getSources()`, `getTags()`, and async `getValues()` providers. The popup returns a tag ID on confirm, or `null` on cancel. A cleared picker returns an empty string through `onChange`.

```javascript
tagPicker(container, {
  label: 'Source Tag',
  value: rule.tag || '',
  getSources: () => sources,
  getTags: () => tags,
  getValues: () => api('values'),
  onChange: tag => { rule.tag = tag; dirty = true; }
});
```

All tag selection outside Tag Creator should use this component. It owns source filtering, search, live-value polling, modal cleanup, confirmation, cancellation, and clearing.

Supported property types are `text`, `number`, `color`, and `tag`. More property types can be added in `showProperties()` in `static/app.js`. Left/Top/Width/Height are stored; Right/Bottom are derived, read-only values. Control IDs remain stable when saved.
The inspector also supports `checkbox` and `select` (with `options` pairs and an optional `default`). The shared `fonts` registry in `controls.js` defines dropdown labels and CSS fallback stacks. `fontFamily` stores a registry ID; `bold` and `italic` store booleans. The default stack remains system-ui. Checkbox properties use a compact single-line layout.

## Add a tray link or function

Add `('My Page', '/#my-page')` to `MENU_ITEMS` in `hmi/tray.py` for a browser link. For another Python function, define a callback accepting `(icon, item)` and append `pystray.MenuItem('My Function', callback)` inside `run_tray()`. Keep callbacks short; put slow tasks in a worker thread. Restart after Python changes.

## Add an action

Add a handler and registry entry to `hmi/actions.py`:

```python
def multiply(current, value):
    return current * value

ACTIONS['multiply'] = Action('Multiply By', multiply, needs_value=True)
```

The browser discovers it from `/api/catalog`; no duplicate frontend list is required. Handlers compute a new numeric value. Driver writes remain centralized in Service.act(). The lock coordinates actions initiated by this process; it cannot make a device's read-modify-write atomic against external clients. Real protocol adapters should handle acknowledgments and failures explicitly.

## Add a protocol driver

PyComm3 uses `hmi/pycomm3_logix.py` and optional `requirements-plc.txt`. Factories must not connect during construction; `status()` must return cached health without network I/O. Real adapters provide `read_many(addresses)` returning `{address: {value, quality, error}}`, plus `read`/`write`, `test`, `browse`, and `close`. Each adapter serializes its own communication and owns reconnect policy. The PyComm3 browser exposes paged cached metadata, lazy structure/array expansion, and `describe(address)` to validate imports.

`hmi/polling.py` caches imported real-source tags. `configure_polling()` updates its configuration snapshot after changes. The scheduler starts at most one job per source, with I/O outside the service configuration lock. `/api/polling/interest` accepts visible saved-page IDs and temporary selected-tag IDs under a per-browser/session lease. `page_tags` gathers all bindings/actions/events/operand references. Rates are selected per tag, from source settings `background` and `live`. Keep browser reads cache-only for future real drivers. Memory retains immediate in-process reads. acknowledge_write advances a generation to discard pre-write in-flight reads without changing cached value, quality, or timestamp. The next scheduled read supplies feedback.

The frontend's `sourceDialog` collects driver settings and a server-issued connection-test receipt; changed settings invalidate the receipt. `static/plc-tag-browser.js` is separate from the normal Memory tag dialog. Add Tag lives in each source header, allowing future drivers to use their own discovery UI. Full source/address uniqueness is checked server-side.

Implement the `Driver` interface in `hmi/drivers.py`, preferably in its own module, then register its factory in `DRIVERS`. The factory receives a settings dictionary. Implement `read(address)`, `write(address, value)`, `browse()`, and `close()`.

Use BAC0/BACpypes3 for BACnet/IP or PyModbus for Modbus. These are suggested integrations, not included adapters. Add your connection fields inside `sourceDialog()` in `static/app.js`; the dialog passes entered values as `settings`. Implement `status()` to return a quality/message dictionary reflecting the actual connection. Initialization and status failures appear as source faults rather than stopping startup.

Define an unambiguous address syntax for each driver. Configure timeouts; surface failed reads as bad quality and failed writes as errors. BACnet needs network interface/device identity/write priority decisions; Modbus needs register offsets, data types, byte/word order, and unit IDs. An async driver should own a dedicated event loop/worker behind the interface, or you can migrate Service to async alongside FastAPI.

## Add an application page

Add an entry to `destinations` in `static/launcher.js`, a matching branch in `route()` in `static/app.js`, and a function building its DOM. Each launcher entry defines a label, destination hash, and SVG path for its icon. Add authenticated `/api/...` routes in `run.py` for backend work. Store structured configuration through Store. Avoid putting business logic in HTTP handlers; expose a service method instead.

The header's `#page-menu` hosts context-specific commands. Page Editor puts Save Page, Grid, Zoom, and View there; runtime shows its page selector and Edit Page. Header height is observed so all three editor frames join the menu even when it wraps. Page Name is edited as Name in page properties. Status messages float over the center frame. The shared `page-heading` CSS class aligns titles with add buttons on list pages. Grid spacing uses one variable for CSS drawing and coordinate snapping. The supported values are Off, 5, 10, and 20.

## Tag conditions

The Events tab edits each control's `events` array. Each visual event stores `id`, source `tag`, `operator`, `operand`, optional `end_operand`, and `action` (`show`, `hide`, `set_colors`). Operands use `{kind: 'value', value: 10}` or `{kind: 'tag', tag: 'Limit'}`. Colors use `backColor`/`foreColor` hex strings. Service.tick() evaluates rules and publishes visual overrides through `/api/control-state`. Effects are declarative while conditions match; later rules win per property. Missing/bad-quality operands suppress effects. Existing legacy tag-write events retain edge triggering.

Mouse actions store `id`, `tag`, `trigger` (`mouse_down`, `mouse_up`, `click`), `action`, and `value`. The browser queues gestures in arrival order. All writes pass through the Python action service. All entries may be incomplete; validate_rule checks readiness at runtime and incomplete entries are skipped. Legacy enabled flags are removed during migration. Errors are exposed through `/api/events/status`. Add hysteresis/cooldown as explicit fields if required.

## Page persistence

`static/editor-view.js` owns session-only per-page zoom/scroll/pan state. A scaled canvas sits inside a stage sized to its visible dimensions. Drag/resize deltas and drop positions are divided by zoom before grid snapping; keep this conversion when adding editor gestures. Runtime rendering does not use the editor viewport.

`/api/pages` returns the page array; POST saves one existing page. `/api/pages/add` creates a page and `/api/pages/remove` removes one. Each page has a stable `id`, `name`, and `controls`. Initial startup migrates old single-page configuration to Main. `Service.usage()` checks control bindings, action targets, and event trigger/target tags; extend that method when adding new reference-bearing configuration. `Service.validate_controls()` checks references before saving. Source/tag deletion checks run under the same service lock as page saves.

Page layout fields are `width`, `height`, `backColor`, `horizontalAlignment`, and `verticalAlignment`; defaults/validation live in `hmi/pages.py`. `page_catalog()` adds destination usage for the landing screen, and `page_usage()` guards removal. Navigation actions use `{action:'navigate', page:pageId}`; popup actions use `{action:'popup', page:pageId, position:'centered'|'mouse'}`, plus the usual id/trigger. Page actions are executed in the browser, while the backend validates readiness before execution. They never enter the numeric tag-write registry.

`static/page-window.js` owns popup placement, caption dragging, closing, resize clamping, and cleanup. It accepts a render callback rather than importing the editor. Control painting receives an owning page and explicit editing flag, so popup rendering does not depend on which main page is active. Runtime alignment is CSS-based and responds to viewport changes without rewriting page coordinates.

## Design conventions

- Favor explicit functions and small registries over decorators or dynamic plugin loading.
- Keep dependencies local to their adapters.
- Store page/configuration data, not executable code.
- Serve frontend assets locally so the HMI works without internet access.
- Test new driver/action semantics; simulation is not evidence of real hardware compatibility.
- Refresh the browser after JavaScript changes and restart after Python changes.


Runtime event evaluation lives in static/visual-events.js. app.js evaluates only affected controls in visible pages/popups after batch samples arrive. evaluateControlEvents returns appearance overrides and accepts a callback for legacy rising-edge writes. Missing/bad samples reset legacy baselines. Never evaluate unseen pages on the server. Add condition behavior here and cover it in tests/visual-events.mjs; hmi/events.py contains configuration constants only.


Browser refresh policy lives in static/refresh-policy.js. app.js selects runtime or management cadence based on visible runtime canvases, retaining the periodic overlap guard. The PLC browser sends tree=true to sources/browse: the driver returns virtual Program:Name branches at the root and their scoped roots on expansion. Legacy flat browse requests remain supported. Branch state and pagination stay in plc-tag-browser.js; expanded children preserve sibling rows and selection.


Local interface support: hmi/network.py enumerates Windows IPv4 adapters with GetAdaptersAddresses via ctypes; other platforms fall back to hostname IPv4 addresses. The authenticated network/interfaces endpoint supplies the source dialog. Optional source settings.local_ip is validated as IPv4. bind_plc_socket() in pycomm3_logix.py isolates the private _sock hook needed by pinned pycomm3 1.2.16; it creates the standard pycomm3 Socket and binds its native socket before LogixDriver.open(). Revalidate this hook when upgrading pycomm3. Automatic mode retains normal driver construction. Connection changes include local_ip; polling-only edits retain the bound connection.


Source identity: sources[].id is permanent; sources[].name is editable display text. Service initialization migrates legacy sources by adding name=id while retaining every original id and tag source reference. Add-source accepts {name,kind,settings} and generates a UUID id; legacy clients providing id remain supported. Edit-source takes the stable id plus optional name/settings. Never use the display name as a driver, polling, lease, or tag-reference key. Tag catalog adds source_name for presentation; persisted tags retain their original source id and unchanged tag ids. Rename validation and persistence happen under the service configuration lock.


Protocol dispatch: the pycomm3 registry entry calls pycomm3_modes.create_driver(settings). settings.protocol selects logix (default for legacy sources), slc, or cip. Logix uses PyComm3LogixDriver; PyComm3SLCDriver and PyComm3CIPDriver share its locking, health, reconnect cooldown, interface binding, and cached polling contract. SLC validates one pycomm3 data-file address. CIP encodes Class/Instance/Attribute:TYPE and supports explicit numeric scalar attributes only, with routed unconnected messaging. The sources/auto-select endpoint performs a read-only routed Identity Object query and classifies known model families; identity bytes are converted to hex for JSON. Extend classify_device for additional known models, and build dedicated adapters for complex device profiles rather than guessing mappings. Test Connection is optional; the browser retains descriptive status but never blocks Save because testing was omitted.


Tag identity: tags[].id is permanent and tags[].name is display text. Legacy migration only adds name=id, leaving every saved reference intact. New browser clients submit name when importing/creating tags, and Service.add_tag generates ids. Legacy id-based add requests remain supported. Names are unique per source, not globally. Memory and SLC allow name edits; Logix uses the discovered address (without Program:) as its new display name and rejects renames. Runtime values and references always use id. Catalogs supply name/source_name; tag pickers and rule descriptions resolve ids for presentation. Never replace binding/event/action ids with display names.


LiveSubscriptions (static/live-subscriptions.js) owns one recursive timeout per source, prevents overlap, fetches immediately on membership changes, and discards closed-job replies. Actions do not force refreshes. app.js tracks page/popup tag unions and maintains Live-interest heartbeats. POST values/batch validates IDs, filters by source, and returns requested cache/Memory samples and Live intervals only. Browser timestamps reject older samples. Legacy control-state/events-status endpoints return empty results for compatibility. No event worker or stored data migration is introduced.


Write access no longer checks tag.writable in Service.act or rule validation. Incoming writable flags are ignored; newly created/edited tags retain writable=true solely for compatibility with previous versions. PLC metadata is stored separately as reported_access and displayed informationally. Drivers still validate data types and return device write errors. Do not reintroduce permission checks using cached discovery access.


Registry naming now uses pycomm3. The adapter classes are PyComm3LogixDriver, PyComm3SLCDriver, and PyComm3CIPDriver. Service startup translates the legacy stored driver key in one SQLite sources update. This is the only application reference to that old key, besides its migration regression test. Source/tag identities and mode settings are never rewritten by the naming migration. The upstream pycomm3 distribution is not renamed or modified.

## Sheet driver

`hmi/sheet.py` isolates file storage and formula evaluation. `SheetDriver` is registered as `sheet`. `requirements-sheet.txt` pins the optional `formulas` engine; Memory/PyComm3 remain usable without it. `Service.configure_polling` binds sheet drivers to the data directory and snapshot/recalculation callbacks. Sheet settings include a simple filename and Background/Live seconds. Only source settings and imported cell IDs are in SQLite; sheet files hold raw contents plus resolved external tag IDs.

The supported function set is explicit in `FUNCTIONS`. `TAG_CALL` recognizes literal quoted TAG paths and converts them into named formula inputs before compiling with `formulas.Parser`. `save_sheet` resolves these to immutable tag IDs; `get_sheet` renders current names for editing. Local cells/ranges are recursively evaluated using a shared memo and visiting set, including cross-sheet TAG references. Errors propagate as bad-quality samples. Do not execute formulas with Python eval or permit TAG writes as a calculation side effect.

`Service.sheet_snapshot` snapshots cache/Memory inputs and calculates sheets under a shared lock. It publishes imported cell samples to the polling cache without network I/O. Poll completion calls `recalculate_sheets` outside the polling lock; Memory writes and saved cell edits also recalculate. Compilation is cached until sheet contents change. Live-interest traversal includes upstream sheet dependencies, detects already-visited IDs, and keeps each source's own rate. Sheet formula usage also protects referenced tags/sources from removal. For larger future sheets, replace whole-sheet recalculation with a dependency graph without changing the driver API.

`static/sheet-ui.js` provides mountSheetGrid and openSheetDialog for editor and read-only modes. The grid retrieves snapshots at the source Live interval, prevents overlapping requests, pauses hidden tabs, and releases interest on close. `static/tag-selector.js` embeds read-only grids and imports selected cells only on Confirm. `pickerProviders` in app.js supplies HTTP callbacks; sheet-interest reference counts support nested pickers. Add formula/persistence/quality tests in tests/test_sheet.py and picker lifecycle tests in tests/sheet-ui.mjs.

Run `python -m unittest discover -s tests` with requirements-sheet.txt installed, plus `node tests/sheet-ui.mjs`. Sheet tests skip explicitly if the optional formula engine is absent. Test fixture browser screenshots are not evidence of hardware compatibility.

The Sheet UI exposes A1:D15 (60 cells). File validation and the engine retain legacy A1:E20 contents for compatibility, including existing imported tags; new imports and new cell entries are constrained to A1:D15. Sheet sources are omitted only from showTags, not from the shared tag catalog/picker. Enter on the formula input invokes the same save handler as the toolbar button. Text selection stays disabled outside inputs.

Sheet editor transitions now call beforeLeave and a shared saveChanges promise. Dirty state compares raw cell text to a saved baseline. The app dialog confirms Save and Continue or Cancel; Enter saves directly. HTTP saves from this editor include validate=true: Service stages formulas under calculation locks, evaluates without publishing samples, and rejects calculation errors without writing the file. Temporarily unavailable source data does not make a syntactically valid formula unsavable. beforeunload protects dirty drafts on browser close/reload. Toolbar and grid share the compact dialog width. Inputs are disabled while loading/saving.

## Sheets landing page and portable JSON

Sheets remain `kind=sheet` internally for polling and stable references, but source/tag management filters them out. `showSheets` owns management and `#sheets` is registered in launcher.js. Keep Sheets in the shared source/tag catalogs so tag pickers and existing page bindings continue to resolve. References use source_catalog.usage; formula references link back to Sheets.

`export_sheet` renders current TAG paths and omits permanent IDs. `import_sheet` creates a new source, binds paths to local IDs, rebinds self references, validates, and rolls back source/file/new cell bindings on failure. `delete_sheet` checks all external page/sheet references, moves the file to a unique .trash name, and removes its source/cell bindings; failure restores the file. HTTP routes are sheets/export, sheets/import, sheets/remove. Continue using sheets/save for confirmed editor saves. New management features are covered in tests/test_sheet.py.

## Text editing and legacy controls

static/text-editor.js owns a draft-only dialog and exports textFields. app.js replaces the common text property with an Edit button, skips other textFields in the sidebar, and applies the returned changes through one markChanged call. Cancel returns null. Existing colorPicker/alignmentPicker modules and the fonts registry are reused. Extend textFields alongside the dialog if you add shared typography options. CSS preserves multiline text for label/numeric/button controls. Label roundedCorners is a checkbox and geometry applies an 8px radius. controls.indicator is hidden from the toolbox and drop targets, but retained for rendering saved pages. Run node tests/text-editor.mjs for cancel/save, multiline text, typography, opacity, and alignment checks.

User-facing tag paths use Source Name\Tag Name. Import tagPath from static/tag-selector.js for UI presentation and formula insertion. It uses source_name and name, retaining periods inside PLC program/member names; it never uses a persisted driver/network path. Service.tag_catalog derives path from current display names for every driver. Stable IDs still key bindings, polling, actions, and event comparisons. Grouped tag lists and name editing fields retain local tag names because their source context is already visible.

Inline text is parsed by static/inline-text.js and hmi/inline_text.py. The syntax is @{Source Name\Tag Name}; templates remain literal in edit mode. Service.save_page binds tokens into control.textRefs and event.contentRefs (path-to-ID maps), dropping removed tokens. Polling interests and deletion usage include these IDs. Browser pageTagIds also resolves unsaved templates against the tag catalog. paintRuntime repaints text when an inline dependency changes; paint substitutes values only in live mode. Set Content carries its own contentRefs with its appearance override. Values are rendered with textContent, never HTML. No additional update timer or writes are introduced. openTextEditor accepts an onInsertTag callback returning a path or null.

static/rule-edit.js handles event movement and duplication. Duplicates deep-copy settings, allocate a fresh ID, and insert immediately after the selected rule. The inspector records the mutation once in page history and preserves its scroll position. Numeric Display is hidden from the toolbox/drop targets with hidden:true, retaining its renderer for saved pages.

Pages store actions/events arrays alongside controls. PageLifecycles tracks rendered canvas instances independently, so duplicate popup instances each receive one open and close transition. syncLiveViews updates lifecycle membership even when visibility pauses polling. Page rule evaluation remains in the browser and applies final appearances per canvas; close_popup invokes only a containing popup close button. Server page_tags, usage, and page_usage include the page itself, using @page for Explorer reference links. Page Close is not a guaranteed browser/process shutdown hook.


BACnet driver extension points

`hmi/bacnet.py` owns settings validation, numeric object/property addresses, discovery cache, scalar conversion, and BAC0 interaction. The synchronous driver interface submits to a single dedicated asyncio loop. Sessions are reference-counted by local transport settings so connection tests can borrow an existing UDP binding without closing it. No BAC0.device handles or autonomous point polling are created. Await `_write` for acknowledgement; do not use BAC0's fire-and-forget write helper. All BAC0 instances in this process share the same loop (its task manager maintains a global task registry).

`static/bacnet-tag-browser.js` is a lazy device/object tree and basic-property selector. The browse endpoint supports root/device nodes and `properties:true` for an object. Discovery/object pages are bounded to 100 items; Refresh invalidates them. `PROPERTIES` is the allowlist for importable properties. Unknown/unsupported property replies become unavailable entries. Units uses the underlying BACpypes application read to avoid BAC0's synthetic noUnits fallback; protocol BaseException replies are converted to ValueError at that boundary.

Persisted addresses use device/type:instance/property, for example 1443213/2:200/presentValue. `bacnet_path` carries the human-readable identifier suffix; `hmi/tag_paths.py` and frontend tagPath produce Source\suffix. Names remain Object Name and need not be unique for BACnet; source+address must be unique. Formula and inline-text binding use the canonical path and store tag IDs. Existing symbolic driver paths remain Source\Tag Name.

Run the regular unit tests with optional Sheet dependencies to cover BACnet/Sheet integration. BACnet adapter tests use an async fake and require no UDP sockets. `tests/bacnet-loopback.py` is a separate opt-in real-library test on loopback ports.

Shapes are defined in static/shapes.js through shapeDefinitions(common), registered in controls.js with category:shapes. Toolbox grouping uses the definition category and keeps the same control IDs/model/action/event pipeline. SVG nodes remain stable during live updates; the containing control stays transparent so fill opacity is not applied twice. ShapeGeometry insets strokes to keep them inside bounds. New text-bearing shape types should be added to the Set Content runtime allowlist in visual-events.js. Stroke Width and Edge Diameter are saved numeric properties and validated as finite/nonnegative.
