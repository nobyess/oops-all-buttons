# Windows portable releases

The portable build includes Python, all supported drivers, sheet calculations, DXF import, the tray icon, and the web interface.

## Build on Windows

Use 64-bit Python on Windows. A dedicated virtual environment avoids bundling unrelated packages from your normal Python installation.

```powershell
python -m venv .venv-build
.venv-build\Scripts\python.exe -m pip install -r requirements-build.txt
.venv-build\Scripts\python.exe tools/build_portable.py --version 0.1.0
```

Change the version for each release. The build produces:

```text
release/
  OopsAllButtons-0.1.0-windows-x64.zip
  OopsAllButtons-0.1.0-windows-x64.zip.sha256
```

The ZIP contains a complete `OopsAllButtons` folder. Extract the whole folder and double-click `OopsAllButtons.exe`. It opens the browser and runs in the tray. Choose **Stop Server** in the tray to quit. Python is not required on the destination PC.

Project data stays in a writable `data` folder beside the executable; bundled application resources stay in `_internal`. Do not install this portable folder under a location that blocks writes. Startup output and errors are saved in `data/server.log`; startup failures also show a message box.

The executable is unsigned. No signing certificate or signing service is configured in this build.

## Verify a build

```powershell
.venv-build\Scripts\python.exe tools/smoke_portable.py build/portable/dist/OopsAllButtons
```

The test uses a disposable copy. It checks frozen dependency imports, a formula calculation, web assets and logo, first-run setup, driver availability, network interface enumeration, the writable data location, a real backup/restore across restart, retained previous data, and login. It does not connect to physical controllers or modify your project.

Also test the release on a Windows machine without Python, including your devices, tray behavior, and backup/restore. Driver libraries are bundled; device interoperability still depends on the equipment and network.

## Upload to GitHub Releases

### Upload from your computer

On the repository's **Releases** page, create a release, choose its tag/version, and attach both files from `release/`. Users download the ZIP; the SHA-256 file provides an integrity check. GitHub's automatic source-code archives are separate from this executable download.

### Build through GitHub Actions

Commit the project with `.github/workflows/windows-portable.yml` at the repository root.

- **Manual build:** open **Actions → Windows portable build → Run workflow**, enter a version such as `0.1.0`, and download the `windows-portable-release` artifact when it finishes. Upload the ZIP and checksum inside it to your release.
- **Tagged build:** pushing a tag such as `v0.1.0` runs the same build and tests, then attaches the ZIP and checksum to a **draft** release. Review it and publish when ready. Published releases are not changed automatically, and existing assets are never overwritten.

The workflow uses GitHub's built-in token. No personal access token is needed. Manual runs only create workflow artifacts; the tag-triggered draft-release job has release-write permission. Actions must be enabled for the repository.

## Updating a portable installation

1. Make a backup in **Administration → Backup/Restore**.
2. Exit the server from its tray menu (start with `--tray` to enable it).
3. Extract the new release into a new writable folder.
4. Copy your old `data` folder beside the new executable. If a restore is pending, copy `data.restore.zip` beside it too. Start the new executable. Alternatively, restore your backup through first run.

Keep the previous folder until you have verified the update. Build ZIPs never include your project data, accounts, logs, or test installations.
