# Getting started with Oops! All Buttons

Go from a first launch to a live value on your own page. You will connect a data source, add a tag, create a page, and place a control. You can also follow along without equipment using the built-in Air Handler simulation.

Before connecting real equipment, read the [safety and network warning](../README.md#safety-and-network-warning). Start with a harmless read-only value. Buttons and actions can write to real controllers.

## 1. Start the app

1. Download the Windows portable ZIP from the repository’s Releases page.
2. Extract the whole folder into a writable location. Keep the `files` folder beside `OopsAllButtons.exe`.
3. Run `OopsAllButtons.exe`. The browser opens at **http://127.0.0.1:8080**.
4. Read and acknowledge the first-run notice, then create your administrator account. Passwords need at least eight characters. If you already have a project backup, you can restore it during first run instead.

For a source installation, follow [Run from source](../README.md#run-from-source).

Use the **three-line menu at the top left** to move between Data Sources & Tags, Pages, Administration, and the other screens. The steps below assume you are signed in as an administrator.

## 2. Connect a device

A **data source** is a connection to a controller, broker, or local data store. A **tag** is an individual value from that source.

1. Open **Data Sources & Tags**.
2. Click **+ Add Source**.
3. Give it a recognizable name, such as `Main PLC`, and choose the driver that matches your device.
4. Enter the connection settings. Use **Test Connection**, review the result, and click **Save**.

The device must be reachable from the computer running the **server**, even if your browser is on another computer. Local network interfaces and serial ports also belong to the server.

| Driver | What to enter |
| --- | --- |
| PyComm3 | Device network path and controller mode: Logix, SLC, or CIP. Use Auto Select if appropriate for your controller. |
| BACnet/IP | The server’s local network interface and, if needed, a discovery target. Match the device network settings. |
| Modbus TCP / RTU | Select TCP or RTU. TCP needs a device host, port, and Unit ID. RTU needs a serial port, Unit ID, and matching serial settings. |
| MQTT | Broker host, port, and any required authentication/TLS settings. |

For a first **Modbus TCP** connection, select **TCP (Ethernet)**, enter the device IP address, use its configured port (usually `502`), and enter its Unit ID. Leave polling intervals at their defaults initially. Testing the connection is useful, but successfully reading a real tag is the next check.

For **RTU**, Test Connection checks whether the serial port opens; it does not prove that a device is answering. Devices sharing a port must use matching serial settings. Physical RTU operation remains untested; see the [testing status](../README.md#testing-status-and-continued-work).

### No device available?

Open **Administration → Simulation**, check **Enable Simulation** and **Air Handler**, and click **Save**. The `Simulation` source and its tags are created automatically. You do not need to add a source or create those tags manually.

Use `Simulation\AirHandler\SupplyAirTemperature` for the display in step 4, and `Simulation\AirHandler\UnitEnableSignal` for the button in step 5. The unit starts off; the button will turn it on. The model uses °F. Saving simulation settings or restarting resets its values.

## 3. Add and check a tag

Select your source in **Data Sources & Tags**, then click **+ Add Tag**.

| Source | How to choose the value |
| --- | --- |
| PyComm3 Logix | Browse the controller’s tags, expand structures or arrays if necessary, select a usable value, and save. SLC/CIP use address-entry dialogs instead. |
| BACnet/IP | Expand a device, choose an object, select a scalar property, name the tag, and save. |
| Modbus | Enter a tag name, area, zero-based offset, data type, and byte/word order from the device’s register map. Use **Read Value** before saving. |
| MQTT | Browse discovered topics or enter the topic directly, give it a tag name, and save. |
| System | Add a named memory tag for a temporary local value. No device connection is required. |

**Modbus example:** If the device manual identifies the first holding register as `40001` and says it is an unsigned 16-bit value, choose **Holding registers**, offset **0**, and **UINT16**. Do not enter `40001` as the offset. Match the device’s actual map and encoding; this example is not a universal device address.

Select the saved tag and check **Current value**. You should see a believable value rather than “unavailable” before moving on. A tag’s displayed path combines its source, optional folder, and name, such as `Main PLC\Temperature`.

The screenshot below uses the built-in simulation. **References** lists the saved controls and trends using the selected tag.

![Simulation source, Air Handler tags, current value, and saved page references](images/data-sources-tags.png)

## 4. Create a page and display the value

1. Open **Pages**, click **+ Add Page**, enter a page name, and save.
2. Select the page and click **Edit Page**, or click its preview.
3. In the left toolbar, choose **Numeric Display**. Hover over an icon to see its name.
4. Click the first corner on the canvas, then the opposite corner to set the control’s size. **Escape** or **Cancel** stops placement.
5. Select the control. In the right sidebar’s **Properties → Content**, click **Tag**, choose your source and tag, then click **Confirm**.
6. Set **Display Digits** and optional **Unit Text**, such as ` °F` or ` psi`. Unit text labels the value; it does not convert or scale it.
7. Give the control a useful name at the top of the right sidebar, such as `Supply Temperature`.
8. Click **Save & View** to save the page and use it live. **Edit Page** takes you back to the designer.

The designer below shows a Numeric Display linked to the simulation’s supply-air temperature. The surrounding diagram was built from ordinary controls and shapes; it is not added automatically when you enable Simulation.

![Designer showing the selected supply-temperature display and its tag and unit settings](images/designer.png)

## 5. Add a button when you are ready to write

Try this with the simulation first. Only use a real writable device tag when it is safe to operate the equipment.

1. Add a **Button** using the same two-corner placement process.
2. With it selected, use **Properties → Content → Edit** to set its text, such as `Unit On / Off`.
3. Open the **Actions** tab and click **+**.
4. Choose **Click** for the mouse event and **Toggle** for the action.
5. Select a writable boolean tag. For the HVAC simulation, use `Simulation\AirHandler\UnitEnableSignal`.
6. Click **Save & View**, then press the button. The simulated blower starts, airflow proves after a short delay, and the supply temperature begins responding.

New actions default to Mouse Down and Toggle. Choose Click explicitly for this example. For a numeric write, use **Set To** with an action value or **Value Input** to prompt the operator.

**Actions** run commands, such as writing a tag. **Events** change appearance or content when a condition is true—for example, changing a color when a value exceeds a limit.

### Insert a value into text

In a Label or Button’s Text Editor, click **Insert Tag**. Choose a tag, decimal places (or **As received**), minimum integer digits for leading zeros, and whether to keep trailing zeros. The preview updates as you change these options. Formatting belongs to that occurrence only; the tag’s underlying value is unchanged. Text and boolean values keep their normal display.

To change an existing insertion, put the caret inside its token in the Text Editor and click **Insert Tag** again. Save the Text Editor, then save the page.

## 6. Save a backup

After saving your page, open **Administration → Backup/Restore** and download a backup. It lets you move or restore the project later. Keep it secure: backups include accounts and driver credentials.

To stop the portable server, choose **Exit** from its tray menu. Closing the browser alone leaves the server running.

## If a value is unavailable

- Check the selected source and tag address, then try the connection/read test again.
- Verify the server has a route to the device and the correct interface is selected.
- For Modbus, check Unit ID, area, offset, data type, and byte/word order.
- For source installations, install the driver’s requirements file and restart.
- Open **Administration → Server Status → Error Log** for details.

## Reuse images, symbols and other files

Open **Administration → Asset Center**, choose **Add Asset**, select a type and
file, and give it a name and category. You can preview files, replace artwork,
and inspect **References** before removing an asset. Replacing a file preserves
saved page references. Full project backups include these assets.

In an Image or Symbol control's Content section, choose **Select Content**.
The picker only shows the appropriate type. Search by name or choose a category,
then double-click an asset or choose **Use Asset**. **Choose File** imports a new
asset for reuse. Built-in symbols remain available in the Symbol picker.
The Site login logo uses the same image picker. In the Text Editor,
**Insert Text Asset** inserts editable text copied from a saved text file.
Movies are managed and previewed in Asset Center and can be served through their
signed-in address; there is no dedicated movie control yet.

### Make an asset a built-in default

When running from source, select an asset in **Administration → Asset Center**
and choose **Make Built-in**. Enter its name/category and choose **Create new
built-in**, or select an existing built-in of the same type to update it. Your
project copy and its page references remain intact. Commit the resulting files
under `static/assets/` (or `static/symbols/` for an updated older symbol) to ship
them with future pulls and releases. This authoring command is unavailable in
portable builds; their normal asset editing and content selection still work.

Category fields accept new text. Use the arrow next to the field to choose an
existing category; selecting one replaces the current text.
