# Third party software notices

Oops! All Buttons' original application code is offered under the [MIT License](LICENSE). This does not relicense its dependencies. Their copyright notices, licenses, and redistribution conditions remain applicable to their respective components.

Portable distributions include a `third-party` directory containing:

- `inventory.json`: the exact versions selected by PyInstaller, license metadata, project links, and paths to copied license texts.
- `licenses`: upstream license, copyright, author, and notice files, including notices for vendored components when present in the installed package.
- `runtime-licenses`: Python's full Windows license and additional native-runtime notices. Python's notice includes conditions specific to Microsoft runtime code; those conditions apply to that code, not to the MIT application source.
- `upstream-references.json`: versioned upstream download references retained for review; the referenced archives are not included.
- `license-supplements`: retained license texts missing from some wheels, plus a clearly labeled BACpypes3 declaration supplement.
- `build-versions.txt`: exact bundled dependency versions.

**Source-distribution review is pending.** At the maintainer’s request, source archives and the source companion download have been removed while the distribution requirements are checked. Keeping notices alone does not establish that all source-availability or library-replacement obligations are met.

## Components needing special handling

| Components | Upstream terms | Distribution handling |
| --- | --- | --- |
| BAC0 and pystray | LGPL v3 | Include LGPL/GPL texts and the corresponding library source. Permit replacement/modification and debugging of those modifications as required by its license; the distribution method remains under review. |
| formulas and schedula | EUPL 1.1 or later | Retain their licenses and notices, and supply their corresponding source under their own licenses. The independent application source is separately MIT. |
| tqdm | MPL 2.0 and MIT, applying to different portions | Retain both sets of notices and make MPL-covered source available as required; the distribution method remains under review. |
| Paho MQTT | EPL 2.0 or BSD 3-Clause | Use the offered BSD 3-Clause alternative; retain its copyright and license text. |
| Other Python dependencies | Primarily MIT, BSD, Apache, PSF, and component-specific terms | See the inventory and full license files rather than relying on this summary. NumPy, SciPy, Pillow, and fonttools include additional third-party notices. |
| Python and native runtime libraries | PSF and component/vendor-specific terms | Retain Python's Windows license, including Microsoft conditions, and native notices. These components are not relicensed as MIT. |
| PyInstaller bootloader and runtime hooks | GPL with bootloader exception; some files Apache 2.0 | The exception permits distributing the application's frozen executable under its own license while honoring dependency licenses. Preserve the supplied notice for clarity. |

The packaged third-party libraries are used without project-specific source modifications. Release maintainers must record modifications if that changes. No PySide/Qt symbol-manager dependency is included in the portable HMI build.

## Source and replacement requirements

The application’s source and build instructions are in the project repository. Third-party source is not bundled at present. Upstream references are recorded to support further review, but links and an MIT license on the application are not a substitute for meeting each dependency’s redistribution conditions.

The MIT application license imposes no prohibition on modification or reverse engineering. Users may modify LGPL-covered libraries and reverse engineer the combined application to debug such modifications. The maintainer still needs to confirm an appropriate source/rebuild or replacement arrangement for binary distributions.

## Maintainer review

See [the license review](docs/LICENSE_REVIEW.md) for scope and outstanding considerations. The inventory is generated from the actual frozen dependency list, not from all packages installed on the development machine. A dependency version or packaging change requires a fresh review. A license label alone is not a complete legal assessment.
