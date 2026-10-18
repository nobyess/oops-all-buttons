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


## Designer chrome guidelines

These rules apply to the designer sidebars, not the controls authored on an HMI page. Keep their styles scoped under `.editor > .sidebar`.

- Both sidebars use 16px padding. Button groups use the shared 8px gap, including toolbox, tabs, alignment, and Actions/Events commands. Grouped buttons have no individual margins.
- Field groups use 12px vertical spacing and a 6px label-to-input gap. Position and size fields use two equal columns with an 8px column gap.
- Sections use the existing neutral horizontal rule with 16px space on each side, followed by a 14px semibold heading. A section directly after a rule does not add another top margin. Page and control Layout sections both follow this pattern.
- Sidebar text is 14px; secondary hints are always centered, 12px with an 18px line height. Standard buttons are at least 36px tall, toolbox buttons 44px, and alignment/command buttons follow the same grouped spacing.
- Checkboxes align inline with their label. Color cards share the available width and the same 8px gap instead of fixed widths that can overflow a resized sidebar.
- Use the `--designer-*` spacing values instead of adding one-off sidebar margins. Preserve overflow, native keyboard behavior, drag targets, and user-configured control fonts/colors.


### Designer field surfaces

Wrap a field's label and editor, or an entire checkbox row, in a quiet surface using `--designer-field-background` (the theme's `--ui-subtle`), a 1px neutral divider border, a 6px corner radius, and 8px inner padding. Alignment groups use the same treatment. Keep the standard 12px field-group spacing and 8px checkbox-row spacing outside these surfaces. Focus within a field changes its outer border to the theme's link color while retaining native input focus indicators.

Color pickers already provide a surrounding surface, so their inner labels do not receive additional boxes. At inspector content widths of 220px or less, paired geometry fields and color cards stack vertically to avoid squeezing the editors. These styles remain restricted to the designer sidebars.


### Related-field outer groups

Use a `settings-group` outer frame for related settings, such as source identity, connection, security, delivery, storage, or polling. Add/Edit Data Source dialogs use these groups for every configurable driver. Keep connection testing and save/cancel commands in the dialog footer.

The outer frame uses `--ui-panel`, a 1px `--ui-divider` border, 6px radius, 8px padding, and 12px separation between groups. A group heading is 14px/20px semibold with an 8px gap below it. The `settings-group-fields` grid uses equal flexible columns, 8px horizontal gaps and 12px vertical gaps; stack into one column at 600px. Individual fields retain their standard subtle surfaces, but remove their external margins inside the grid so spacing is not doubled. Related rows and explanatory hints span both columns. Do not add another decorative frame around an existing color card or filter input. Conditional settings remain hidden and disabled as before.


### Top-bar companion style

Use the same theme-aware subtle field surface, 1px neutral border, 6px radius, and 8px gaps in the header. Top-bar fields keep labels inline and use compact 4px vertical / 8px horizontal padding with 30px-high selects. Header buttons are at least 40px high; the launcher is 40px square. Preserve the 64px single-row header, centered clock, scrolling command groups, primary Save & View emphasis, and kiosk/logged-out visibility rules. The compact field padding is a deliberate header-only exception to the designer sidebar's 8px padding.

The inspector begins with the Page Name, Control Name, or Group Name field, above its tab strip. This field stays available on every tab. Do not add a redundant Name heading above it. Use a standard section divider between the name field and tabs, and between the tabs and their content.


### Designer listboxes

Explorer and the Actions/Events lists share the `editor-list-scroll` viewport and `editor-scroll-list` native select styles:

- The visible viewport has a 6px corner radius, 1px theme-neutral border, and `--ui-panel` background. Its focused border uses `--ui-link`.
- Rows use 14px text, a 20px line height, 6px vertical / 8px horizontal padding, and a minimum 32px row height. The list has 4px inner padding.
- Selected rows use the dedicated `--designer-list-selection` / `--designer-list-selected-text` pair: white text on deep teal in light mode, and near-black text on light cyan in dark mode. Keep at least 4.5:1 text contrast, including when the list loses focus; do not use the subtle selection colors for these rows. Honor system selection colors in forced-color modes; do not remove keyboard focus behavior.
- Adjacent command rows are 8px below the list field. Explorer's centered instructions keep their own standard 8px hint spacing before its Delete button.
- Use native vertical scrolling and a horizontal overflow viewport for long row labels. Preserve horizontal and vertical scroll positions across inspector refreshes, keyed separately by page, selected control/group, and Actions/Events tab. Explorer remembers its viewport per page. A newly opened list may initially reveal its selected row.
- Reorderable Explorer lists show a 2px drop line clipped to the visible list viewport. Dragging changes order only; group membership is managed by the group commands.

These rules do not style the Listbox control placed on an HMI page, tag pickers, or management-page lists.


### Designer popups and tag picker

Use `designer-dialog` for designer dialogs, including Text Editor, parameter configuration/connections, group selection/creation, access-role selection, and unsaved-change confirmations. The shared tag picker uses it wherever opened. Generic app dialogs opt in when opened from the designer.

Use 24px dialog padding, 8px outer corners, 20px/28px semibold titles with 16px separation, 14px/20px body text and section headings. Fields retain the sidebar's subtle surface, 6px corners, 8px inner padding, 12px spacing and 6px label gap. Checkboxes stay inline; color cards avoid nested surfaces. Secondary hints remain centered at 12px/18px. Buttons are at least 36px high with 8px gaps; right-aligned footers have 16px top spacing. Rules use neutral theme dividers with 16px margins.

Filter/search inputs are an exception to field surfaces: retain the input's own border and focus indicator, but do not add a surrounding box, background, or padding to its label. Dialog bottom padding is the same 24px as the other edges. Footer content must not add trailing paragraph/row margins or a minimum height that creates extra bottom space. In the tag picker, bottom-align the command row with the selection summary and use an explicit 12px gap between its name and current value.

Popup listboxes and tag-picker source rows follow the Designer listboxes row and high-contrast selection rules above, including forced-color support. Keep native keyboard behavior, existing selection persistence, and scrollbars. The tag picker's two columns use a 16px gap and keep their constrained height; sheet previews scroll inside that space. Parameter rows and text-editor columns retain their specialized responsive layouts. Dialogs scroll within 92dvh rather than clipping fields or focus rings. These popup rules do not affect authored HMI controls, the application launcher or live page popups.

The top-bar account popup also uses `designer-dialog` on every page: 24px padding on all edges, standard headings/hints/buttons and footer spacing. Keep its top-right anchoring and viewport height limit. User/level details share a subtle 8px-padded surface; read-only role rows use the standard 32px row height inside a bounded scrolling list.


### Pages management

Scope management chrome under `.pages-library`; never style descendants of the rendered page preview as application UI. Use 24px card padding (16px on narrow screens), 20px/28px titles with 16px separation, unboxed search inputs, 16px column gaps and 8px command gaps. Buttons are at least 36px tall with 6px corners. Page list rows use 6px/8px padding, 14px/20px primary text, 12px/18px metadata, and the shared high-contrast selection pair for both text lines. Preview frames use 6px corners. Details use a neutral divider with 16px spacing; secondary metadata is centered. Parameter entries use the standard subtle field surface. Add/rename/remove dialogs opened here use the shared popup guidelines. Preserve list keyboard navigation, preview behavior, responsive stacking, references and import/export.


### Flat tab strips

Pages detail tabs and the designer inspector use flat, equal-width tabs with a shared 1px neutral bottom rule. Use zero gaps, transparent backgrounds, square corners, 14px/20px semibold labels, at least 40px height, and 8px vertical / 12px horizontal padding. Inactive labels use the theme muted color; the active label and its 3px bottom underline use the theme link color. Reserve the underline space on every tab so selection does not shift layout. Hover uses the subtle hover surface and link text; retain native keyboard focus indicators. Long strips scroll horizontally without wrapping. Leave 16px below the strip and omit a redundant section rule immediately after it. This replaces the earlier filled-button tab style; ordinary buttons and selected list rows retain their own styling.


### Integrated Sheets workspace

`static/sheets-manager.js` embeds the existing editable `mountSheetGrid` on the Sheets management page. Sheet/References/Settings use flat tabs. Cell changes, sheet changes, tab changes, management commands and route changes must pass the dirty-cell confirmation and server `sheets/save` validation (`validate:true`). Validation failure and Cancel retain the current sheet and draft; Revert clears selection and focus. Enter saves directly, Escape reverts. Browser unload retains native dirty protection. Close releases polling interest and timers. Do not add routine status text below the grid; display actionable errors only. Keep the standalone cell picker/dialog for other callers.

The integrated sheet formula toolbar (cell address, formula input, Insert Tag, function picker) uses one shared subtle field surface: 1px neutral outline, 6px corners, 8px padding and gaps, with a link-colored border on focus within.

The integrated sheet toolbar has no outer margin; the grid below supplies a single 16px top gap, matching the 16px list/editor column gap. Avoid adding toolbar bottom margin to that spacing.

Reset the integrated `.sheet-grid` table margin-top to zero: the scroll wrapper owns the 16px gap, and the global management-table margin must not add another 20px inside it.


### Data Sources & Tags management

Use the same 24px card padding (16px narrow), title spacing, unboxed search, 16px column gap, 8px command gaps, 36px buttons, 6px viewport corners and 32px list rows as the other management pages. Source and tag selections use the shared high-contrast theme pair, retaining explicit source status-dot colors. Details use a neutral divider with 16px spacing and a subtle 8px-padded information surface. Preserve the bottom-aligned details layout, clickable indented references, native scrolling and keyboard behavior. All dialogs opened from this page opt into shared popup styling, including driver tag discovery lists. Selected discovery metadata inherits the selected text color; unavailable entries retain their disabled semantics. Forced colors use system selection colors.


### Administration

Administration uses shared management card spacing, flat underlined top tabs, 16px column gaps, 8px command gaps and 36px buttons. Users and Access lists use the common 6px viewport corners, 32px rows and high-contrast selected text/background pair. User details and session-setting fields use subtle surfaces with 8px padding and 12px field spacing; hidden duration fields must remain hidden. Secondary hints are centered at 12px/18px. Server Status uses subtle statistic/driver surfaces with neutral borders and 6px corners; error logs retain their bounded scrolling area and grouped updates. Preserve the existing refresh cadence, log update behavior, role permissions and save semantics. Access dialogs already use shared popup chrome. On narrow screens, reduce card padding to 16px and stack statistics and drivers.

Server Status summary statistics are grouped into Server, CPU & Threads, System Memory, Requests & Errors, and Polling & Project. Use one subtle surface per group, with an ordinary section heading and related label/value rows inside.


### Inline user settings and individual sessions

Administration separates Users, Access, and Server Status. `static/user-access-manager.js` owns the inline selected-user draft with Account (username, level, password), Access (kiosk, starting page, roles), and System (theme, login sessions) tabs. Save User validates the complete draft; changing sub-tabs preserves it. Revert restores saved values. Warn before discarding drafts when changing users, top tabs, or routes. Access roles have a separate inline name editor. Existing password/last-administrator/role validation remains server-side.

Users may store validated `session_settings` with mode fixed/inactivity/never and hours 0.01–8760. Authentication resolves the current user's policy on every request, so saved edits apply to existing sessions. Users without an explicit policy retain the former server setting as their default; public user records expose the effective policy. Theme remains per user. Restarting the server still clears sessions. Legacy global session-setting endpoints remain for compatibility but are no longer the Administration editor.

Users and Access use equal-height editor/list columns with a 440px minimum workspace height on desktop. The left column is a flex column: its list grows to fill available height and its Add/Remove command row sits at the bottom. On stacked mobile layouts, use a bounded 238px list instead.

The right-hand user/role editor is also a flex column. Its form fills the column and its footer uses automatic top margin with 16px top padding, keeping Save/Revert on the same bottom baseline as the list commands.

Role membership is edited on Administration > Access with Assigned Users checkboxes. Save Role validates user IDs and commits role name and memberships in one Store.set_many transaction, preserving other roles. Users > Access shows read-only role links; clicking one opens Access with that role selected after the dirty-draft guard. User saves omit roles and the server preserves existing memberships when roles are omitted.

Assigned Users uses a bounded scrolling checkbox group (280px maximum height) with an unboxed search input above it. Filtering hides rows without dropping selections; hidden checked users remain part of Save Role. Filtering alone does not dirty the role draft.

First-run setup uses static/first-run.js: equipment safety/responsibility notice, explicit acknowledgement, then administrator fields with password confirmation. The /api/setup endpoint requires safety_acknowledged to be the literal boolean true before creating the account. Existing installations and normal login are unchanged. First-run content follows theme-aware popup spacing and allows page scrolling.

Regular login follows shared 24px card padding, 20px title, subtle field surfaces with 8px padding, 6px corners, 12px spacing and a right-aligned 36px submit button. New/reset passwords require at least 8 characters, validated server-side; empty edit passwords keep the existing hash. Temporary live-timing diagnostics and their sampling loop have been removed entirely.


### Shared messages and remaining chrome audit

Use `static/message-dialog.js` for application confirmations and informational notices instead of browser alert/confirm/prompt. Confirmations return a Promise<boolean>; await the result before mutating data. Escape, Cancel and external closure cancel the operation; restore focus to the invoking element. Duplicate concurrent confirmations are rejected. Designer deletion checks the captured page after awaiting confirmation. User/role drafts and removals use the same custom dialogs. Keep browser-owned beforeunload warnings and file selection native.

All generic app dialogs now use designer-dialog, as do standalone sheet editing, Value Input and session/disconnection notices. Sheet toolbar/grid spacing has one 16px gap with table margin reset. Launcher uses 24px padding, 8px gaps and 6px tile corners; standard-user Pages buttons and runtime-window caption chrome follow shared controls. Do not apply application styling inside authored live page contents. The first-run notice and regular login keep their dedicated shared-style surfaces.


### Popup keyboard and navigation

`installDialogKeyboard` handles unmodified Enter/Escape for custom dialog chrome. Enter activates an enabled default/submit/confirmation action, even when Cancel initially has focus; disabled actions do nothing. Escape invokes the dialog cancel path. Existing deliberate child handlers (sheet formula save/revert, tree navigation) retain precedence. Multiline text uses Enter to save and Shift+Enter for a line break. Ignore composition and key repeats. Native file pickers/unload prompts keep browser behavior.

`navigation-history.js` stamps same-document history entries. Cancelled dirty navigation traverses back to the accepted entry instead of replacing the destination URL; accepted navigation keeps the original entries for Back/Forward. Page selection must not replace the Pages entry before navigating to its editor. Serialize unsaved-change decisions to prevent duplicate route prompts. Regression tests cover dialog keys and history restoration.


### Page and application backgrounds

Page Layout exposes Show Background immediately below Show Border. `showBackground` defaults to true and must be boolean; false renders the page canvas transparent without changing its stored backColor or control colors. Use the same behavior in the designer, runtime, previews and popup canvases. Popup frames with Show Background disabled use the current user’s app background (or theme default) as an opaque backing, so underlying controls do not show through. Regular pages remain transparent.

Users > System stores optional `app_background` as an opaque #RRGGBB value, or an empty string for the theme default. Use Theme Background disables the color picker. `applyTheme` applies the user override through --app-background and preserves it across system-theme changes; login clears it. Body and page-preview backdrops consume it, while application panels retain theme surfaces. Saving other user fields preserves this preference. Validate server-side and test isolation between users.


### Built-in System and persistent SQLite tags

`hmi/local_drivers.py` implements SystemDriver and DatabaseDriver. Service ensures one protected System source and derives fixed read-only Time tags without persisting copies of them in config. User-created System tags are Memory tags, with immutable Memory/id addresses and folder-aware display paths. Built-in Time tags cannot be renamed, deleted, or written. The public source-creation API and catalog exclude standalone Memory and System creation; legacy Memory sources are folded into System at startup with tag IDs retained. The old Memory adapter remains an internal compatibility boundary for fixtures/legacy callers.

Database sources validate a managed filename, bind to data/databases, and store JSON scalar values keyed by stable tag IDs in hmi_values. read_many uses one connection with bounded IN queries; writes are parameterized transactions. Context managers close every connection. Prevent two sources owning the same filename, and do not retarget an existing source to a different file. The filenames endpoint is administrator-only. System/Database writes publish actual read-back to the shared sample cache and recalculate dependent sheets. All other interest/batch/live-view plumbing remains shared.

Tag paths include optional folder metadata consistently in Python and JavaScript. The tag picker renders System with Memory and Time children; source management shows folder-qualified local names, disables System Edit/Remove and protects builtin tags. API and UI protection are both required. Tests cover file validation, persistence, name/ID stability, builtin protections and native polling sample shape.


Text Editor groups colors and Blink under Appearance. Its textarea uses selected foreground/background colors over a preview surface matching the page backdrop, so transparent colors are not incorrectly composited onto the dialog theme. Blink is saved in textFields and Set Content contentStyle, and applied only to label/button content in live view with a one-second CSS animation; the editor stays steady. System Time/DateTime formats server-local time as M/D/YYYY h:mm:ss AM/PM.


### Alarms

`hmi/alarms.py` evaluates read-only tag conditions on the server, under `Service.lock`, after shared cache/Sheet updates. Alarm dependencies never add live polling interest. Only the normal browser/page leases choose live intervals; alarm-only tags use background intervals. No device reads, tag writes, or per-poll configuration writes belong in the alarm evaluator; persist only state transitions. Unknown/bad feedback retains an existing active occurrence and reports unavailable quality. Condition changes begin a fresh occurrence. Keep silence state scoped to an occurrence and reject stale occurrence tokens. Silence attribution must always come from the authenticated server actor, never request fields; durable state and audit inserts share one SQLite transaction. Active silence state survives restart; reactivation resets silence. Include alarm tag dependencies in references/deletion protection.

`static/alarms-manager.js` follows shared 24px card padding, flat underlined tabs, 16px columns, 12px fields, 8px field surfaces, 6px corners, and high-contrast list selection. Operand mode and value/tag share one field surface. Active rows show activation date/time and Silenced by Username/time. Text filtering is immediate, date bounds apply with Apply Filter, and Silence All intentionally includes hidden active alarms. Refresh only changed active rows/list options; do not rebuild the editor while typing. Dirty configuration must use the shared Cancel/Discard/Save & Continue dialog before navigation. Standard users may view/silence; admin configuration and existing kiosk restrictions are enforced server-side.


Alarm attention uses the small `/api/alarms/attention` active-only payload on all signed-in pages. Kiosk access is limited to this payload and `/api/alarms/silence` (a single occurrence token; reject Silence All for kiosk users), not the configuration page or Silence All API. Always derive silence identity from the authenticated actor. `static/alarm-attention.js` owns one stable header bell, queues modal focused notifications without stacking over other dialogs, and remembers dismissals per user/tab session. Keep polling single-flight, discard responses from a previous login, clear UI on sign-out, and hide the bell on the login screen. `focused` is an optional alarm definition boolean, default false, and does not change the condition or current occurrence.


Alarm History uses the SQLite alarm_history table keyed by occurrence; activation, clear, and silence updates share a transaction with runtime state changes. Keep activation name/message snapshots on existing rows when definitions are renamed. Retain history when definitions are removed, and record why an active occurrence ended. Backfill only known information from older alarm_states/alarm_silences; never invent missing times. History queries are parameterized and limited to 50 rows, with indexed timestamps and server-side text/date filtering. The History tab polls every five seconds only while visible and skips unchanged rows. Focused attention and manual bell clicks share one popup/list renderer and the single Silence endpoint; there is no separate Ack action or endpoint.

Event condition editors share one outer field surface for Comparison and every operand mode/value/tag (including both range endpoints). Use event-condition-group in the designer and alarms; keep nested operand groups unboxed, with 12px spacing, 8px outer padding, and 6px corners.

Action settings start with Access Roles, then the trigger. Action and its tag/value or action-specific options share one event-action-group surface. Alarm option checkbox rows use 8px outer spacing, 12px label/control gap, and align-self:auto on the checkbox so the global column-field alignment cannot pull it above the text center.


Alarm requiredRoles follow action semantics: all selected IDs required, empty list allows any signed-in user, administrator bypass. Validate role IDs on alarm save. Alarms.can_silence is the authoritative server check; single denied silence returns 403, Silence All skips denied occurrences and reports a count. Add per-user canSilence to both main and attention payloads and disable matching UI controls, but never trust client flags or supplied roles. Role removal must check alarm references. Non-kiosk standard users have launcher/route access to Alarms/History but no Configuration tab; admin-only save/remove endpoints enforce this boundary. Keep live actor roles resolved by existing session validation so membership changes apply without relying on browser snapshots.


### Data source field hints

Add/Edit Data Source fields include a short, persistent secondary hint inside the field surface: centered 12px/18px, normal weight, `--ui-muted`, and the standard 6px label/editor gap. Use `aria-describedby` to associate hints without changing the field’s accessible name. Checkboxes keep their text and checkbox inline, with the hint spanning the row underneath. Address fields use consistent `Example: …` placeholders; distinguish local interfaces from remote devices. Port hints identify the transport and usual protocol port, including MQTT’s TLS alternative. Hints must not change saved values or silently switch ports. Keep optional fields explicitly optional and describe timing units and automatic behavior.
