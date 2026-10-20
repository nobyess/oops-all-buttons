# Reviewed upstream materials

Source archives are not stored here or bundled while the maintainer reviews distribution requirements. `upstream-references.json` retains versioned URLs and hashes from the earlier review; these are references, not included downloads or a statement that providing links is sufficient.

`runtime-licenses` contains supplementary notices for OpenSSL 3.0.18, zlib-ng 2.2.4, and SQLite’s public-domain dedication. Python’s Windows license is copied from the build interpreter during packaging, including Microsoft runtime conditions.

`license-supplements` preserves upstream license texts missing from some wheels and the explicitly labeled BACpypes3 license-declaration supplement. These are notice files, not source bundles.

Future builds collect installed-package notices and an inventory, with source-distribution review marked pending. Retain required notices and separately resolve any source-availability or replacement obligations before relying on this packaging for redistribution.

Upstream references:

- OpenSSL: https://github.com/openssl/openssl/blob/openssl-3.0.18/LICENSE.txt
- zlib-ng: https://github.com/zlib-ng/zlib-ng/blob/2.2.4/LICENSE.md
- SQLite: https://www.sqlite.org/copyright.html
- CPython Windows dependency versions: https://github.com/python/cpython/blob/v3.14.0/PCbuild/python.props

For the maintainer's review, see `docs/LICENSE_REVIEW.md` and `THIRD_PARTY_NOTICES.md` at the repository root.
