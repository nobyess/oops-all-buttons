# Source, library replacement, and rebuilding

The portable ZIP contains the exact application snapshot in
`third-party/application-source.zip`, reviewed upstream library archives in
`third-party/sources`, and exact package/build-tool versions in
`third-party/build-versions.txt`. The inventory records source URLs, hashes and
how many installed Python source files were compared with each archive.
These files accompany the executable; no separate source download is needed.
Each library remains under its own license. See its source archive and the
`licenses` directory. The application's original files remain MIT.
Modification of LGPL libraries and reverse engineering to debug those
modifications are permitted. There is no signing restriction or activation key
preventing you from running a rebuilt application.

## Rebuild with a modified library on Windows

1. Extract `application-source.zip` into a writable folder. Keep the complete
   portable release separately for its archives, inventory and version list.
2. Install 64-bit CPython matching the version in `BUILD-INFO.json`. Create an
   environment in the extracted `python-hmi` directory:

   ```powershell
   python -m venv .venv-build
   .venv-build/Scripts/python.exe -m pip install -r requirements-build.txt
   .venv-build/Scripts/python.exe -m pip install -r PATH_TO_RELEASE/third-party/build-versions.txt
   ```

3. Unpack the library archive you want to modify, make your changes, and install
   that local source with the build interpreter. For example:

   ```powershell
   .venv-build/Scripts/python.exe -m pip install --no-deps --no-build-isolation --force-reinstall PATH_TO_MODIFIED_LIBRARY
   ```

   Install its documented build backend if pip requests one (for example
   setuptools or hatchling). Keep modification notices, dates and corresponding
   source when redistributing modified libraries.
4. Build a replacement executable directly using the included specification:

   ```powershell
   .venv-build/Scripts/python.exe -m PyInstaller --noconfirm --clean --workpath build/custom/work --distpath build/custom/dist packaging/windows.spec
   ```

   The resulting application is `build/custom/dist/OopsAllButtons`. Copy your
   project data only after stopping the original server. You can also run the
   extracted application with `.venv-build/Scripts/python.exe run.py`.

The release collector deliberately rejects locally modified library source
against the original upstream hashes. That does not prevent building or running
a modified executable with PyInstaller as above. To redistribute your custom
build, supply its matching library source, changes and notices, and update the
reviewed source manifest/verification policy for that release.

## Maintainer release procedure

`tools/build_portable.py` downloads missing pinned archives over HTTPS, validates
their SHA-256 hashes, compares the relevant installed Python source files,
collects license texts, and creates the application snapshot automatically.
Unexpected reciprocal dependencies, version mismatches, changed source, missing
notices or bad hashes stop the build. The cache is Git-ignored; a clean checkout
can download it again. Retain the original release ZIP and its checksum for as
long as it is offered. Ignoring source archives in Git does not remove them from
the portable release or their redistribution requirements.

This supplies the reviewed LGPL source/rebuild route and the EUPL/MPL source
materials. Dependency or interpreter changes still require a fresh review of
licenses and native components; automated packaging is not legal certification.
