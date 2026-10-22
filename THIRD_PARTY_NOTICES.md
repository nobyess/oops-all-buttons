# Third party software notices

Oops! All Buttons' original application code is offered under the [MIT License](LICENSE). This does not relicense its dependencies. Their copyright notices, licenses, and redistribution conditions remain applicable to their respective components.

Portable distributions include a `third-party` directory containing:

- `inventory.json`: the exact versions selected by PyInstaller, license metadata, project links, and paths to copied license texts.
- `licenses`: upstream license, copyright, author, and notice files, including notices for vendored components when present in the installed package.
- `runtime-licenses`: Python's full Windows license and additional native-runtime notices. Python's notice includes conditions specific to Microsoft runtime code; those conditions apply to that code, not to the MIT application source.
- `upstream-references.json`: versioned upstream download references and SHA-256 hashes used for source verification.
- `license-supplements`: retained license texts missing from some wheels, plus a clearly labeled BACpypes3 declaration supplement.
- `build-versions.txt`: exact bundled dependency versions.

- `sources`: corresponding source archives for BAC0, pystray, formulas, schedula and tqdm, under their respective licenses.
- `application-source.zip`: matching original application source and build scripts.
- `REBUILD.md`: instructions for modifying a library and rebuilding the application.

Source materials accompany the portable executable in the same ZIP. Download caches and generated source snapshots are excluded from Git, while the manifest, notices and build scripts remain tracked.

## Components needing special handling

| Components | Upstream terms | Distribution handling |
| --- | --- | --- |
| BAC0 and pystray | LGPL v3 | Include LGPL/GPL texts and the corresponding library source. Permit replacement/modification and debugging of those modifications as required by its license; the source and rebuilding instructions accompany the executable. |
| formulas and schedula | EUPL 1.1 or later | Retain their licenses and notices, and supply their corresponding source under their own licenses. The independent application source is separately MIT. |
| tqdm | MPL 2.0 and MIT, applying to different portions | Retain both sets of notices and make MPL-covered source available as required; the source and rebuilding instructions accompany the executable. |
| Paho MQTT | EPL 2.0 or BSD 3-Clause | Use the offered BSD 3-Clause alternative; retain its copyright and license text. |
| Waitress 3.0.2 | Zope Public License 2.1 | Retain its copyright and full license text, included in the portable dependency inventory. Used without source modifications. |
| Other Python dependencies | Primarily MIT, BSD, Apache, PSF, and component-specific terms | See the inventory and full license files rather than relying on this summary. NumPy, SciPy, Pillow, and fonttools include additional third-party notices. |
| Python and native runtime libraries | PSF and component/vendor-specific terms | Retain Python's Windows license, including Microsoft conditions, and native notices. These components are not relicensed as MIT. |
| PyInstaller bootloader and runtime hooks | GPL with bootloader exception; some files Apache 2.0 | The exception permits distributing the application's frozen executable under its own license while honoring dependency licenses. Preserve the supplied notice for clarity. |

The packaged third-party libraries are used without project-specific source modifications. Release maintainers must record modifications if that changes. No PySide/Qt symbol-manager dependency is included in the portable HMI build.

## Source and replacement requirements

The matching application source, reviewed library source archives and [rebuilding instructions](third-party/REBUILD.md) accompany the portable executable. The collector checks installed Python source against the pinned archives and rejects unreviewed reciprocal dependencies or source mismatches.

Users may modify LGPL-covered libraries and reverse engineer the combined application to debug such modifications. Rebuild with modified libraries using the provided application source and PyInstaller specification; no signing restriction prevents running the result. Each library's source remains under its own license; the independent application files remain MIT.

## Maintainer review

See [the license review](docs/LICENSE_REVIEW.md) for scope and outstanding considerations. The inventory is generated from the actual frozen dependency list, not from all packages installed on the development machine. A dependency version or packaging change requires a fresh review. A license label alone is not a complete legal assessment.
