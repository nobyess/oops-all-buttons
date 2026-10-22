# Portable release license review

Reviewed October 19, 2026, against the Windows x64 **0.1.4** PyInstaller output built with Python 3.14.0. This is a technical redistribution review, not a legal opinion or a certification that every jurisdiction treats library combinations identically.

## Current status

Updated October 20, 2026: source packaging is restored. Future portable builds include hash-verified source archives for the five reviewed LGPL/EUPL/MPL dependencies, matching application source, installed-source comparisons, and a documented library replacement/rebuild route. Generated downloads and snapshots are Git-ignored; notices, manifests and build logic remain tracked. See `third-party/REBUILD.md`.

This is a technical packaging review, not a universal license-compliance certification. The BACpypes3 upstream attribution gap described below remains documented.

Updated October 21, 2026: the HTTP server now uses unmodified **Waitress 3.0.2**, under the Zope Public License 2.1. Its installed copyright and license text are collected into portable builds with distribution metadata and a versioned upstream reference. This dependency adds no new reciprocal source archive to the five already packaged. The current generated inventory records the exact distribution count.

## Application license

The original Oops! All Buttons code is offered under MIT, with the repository owner's public handle `nobyess` in the copyright notice. This grant covers rights the project can license; it does not claim ownership of third-party code or replace its licenses. The existing Codex acknowledgment and equipment/network warnings remain in place.

## Findings and changes

- PyInstaller selected **27 Python distributions**, including its own runtime-hook distribution. The generated `third-party/inventory.json` lists the exact names and versions. Build-only tools that were not selected are excluded from that runtime inventory.
- **BAC0 2026.7.25 and pystray 0.19.5** use LGPL v3. Include their source, LGPL/GPL texts, and a practical rebuilding route for replacement libraries. The included application source, library archives and rebuilding instructions provide the selected source/rebuild route.
- **formulas 1.3.4 and schedula 1.6.15** use EUPL 1.1 or later. Include their licenses and corresponding source. The European Commission's EUPL guidance distinguishes independent linking from merging/modifying covered code; the project uses these as separate libraries. That is the basis for keeping the independently authored application MIT, not a blanket claim that arbitrary code combinations are compatible.
- **tqdm 4.70.1** includes MPL 2.0 and MIT portions. Include its complete source archive and both notices rather than treating the whole package as MIT.
- **Paho MQTT 2.1.0** offers EPL 2.0 or BSD 3-Clause. The portable distribution uses the BSD alternative.
- **NumPy, SciPy, Pillow, fonttools, regex, and Python** carry additional component-specific notices. The collector retains the license files supplied by their distributions; Python's full Windows license includes Microsoft runtime conditions. Supplementary native notices cover OpenSSL, zlib-ng, and SQLite. Do not label these native binaries MIT.
- **PyInstaller's bootloader exception** permits the application to use its own license, subject to dependency terms. Its license/exception is retained even though the exception does not require an acknowledgment.
- The local **PySide/Qt symbol-library authoring tool is not bundled** in the portable executable. Its licensing would require a separate review if distributed later.
- **BACpypes3 0.0.110 has an upstream notice gap:** its release metadata explicitly declares MIT, but neither its wheel nor source archive includes a standalone license/copyright file; an older classifier says BSD. The repository retains a clearly labeled supplement with the MIT declaration, author attribution from metadata, and standard MIT permission/disclaimer text. No missing copyright date has been invented. Confirmation/correction of the upstream notice is recommended; this is an outstanding attribution-documentation issue, not a finding that the package is unlicensed.

Compared the installed Python source with the downloaded upstream archives (normalizing line endings): BAC0 59 files, pystray 13, formulas 31, schedula 84, and tqdm 31. No differences were found in the files compared. Archive provenance, exact versions, and hashes are retained in `third-party/upstream-references.json`; the five reciprocal-library archives are downloaded and verified during builds. pystray's PyPI version has no sdist, so its matching upstream GitHub tag is used.

## Previously built releases

The existing 0.1.4 and 0.1.5 ZIPs predate restored source packaging and have not been rewritten or republished. Publish a newly built complete ZIP for the current source. Older published binaries need their own matching source/notices if retained for download; a new application snapshot is not evidence of the exact source used in an older binary. Nothing is uploaded to GitHub automatically by this local work.

## Continuing responsibilities

- Keep all relevant license/copyright notices and the accompanying source available when redistributing. Modified third-party libraries need modification notices and updated corresponding source; archive hashes alone do not establish that the executable uses that source.
- A dependency/Python/compiler upgrade requires review of changed licenses, bundled native libraries, and Microsoft redistribution terms. The collector blocks missing package-license texts, and requires reviewed matching reciprocal-library archives. It cannot interpret every license automatically.
- User-imported logos, symbols, images, fonts, device profiles, and contributions need their own provenance/permission checks. This dependency review does not establish ownership of arbitrary artwork or AI-generated output.
- The technical review found separate-license obligations, not a reason to relicense every original application file under LGPL or EUPL. Obtain qualified legal advice before relying on a particular interpretation for commercial or unusual redistribution arrangements.

## Primary references

- [MIT license](https://opensource.org/license/mit)
- [GNU LGPL v3, especially section 4](https://www.gnu.org/licenses/lgpl-3.0.html)
- [European Commission EUPL guidance](https://interoperable-europe.ec.europa.eu/collection/eupl/faqs)
- [Mozilla MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
- [PyInstaller license and exception](https://pyinstaller.org/en/stable/license.html)
- [CPython 3.14 Windows dependency versions](https://github.com/python/cpython/blob/v3.14.0/PCbuild/python.props)
