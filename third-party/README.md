# Reviewed upstream materials

The build downloads reviewed reciprocal-library source into Git-ignored `sources/`, validates hashes from `upstream-references.json`, and includes it in the portable release together with the matching application source and [rebuilding instructions](REBUILD.md). Notices and build inputs remain tracked; generated releases and download caches stay out of Git.

`runtime-licenses` contains supplementary notices for OpenSSL 3.0.18, zlib-ng 2.2.4, and SQLite’s public-domain dedication. Python’s Windows license is copied from the build interpreter during packaging, including Microsoft runtime conditions.

`license-supplements` preserves upstream license texts missing from some wheels and the explicitly labeled BACpypes3 license-declaration supplement. These are notice files, not source bundles.

Future builds collect installed-package notices and an inventory, verified source archives and the matching application snapshot. Review new dependencies and native components when versions change.

Upstream references:

- OpenSSL: https://github.com/openssl/openssl/blob/openssl-3.0.18/LICENSE.txt
- zlib-ng: https://github.com/zlib-ng/zlib-ng/blob/2.2.4/LICENSE.md
- SQLite: https://www.sqlite.org/copyright.html
- CPython Windows dependency versions: https://github.com/python/cpython/blob/v3.14.0/PCbuild/python.props

For the maintainer's review, see `docs/LICENSE_REVIEW.md` and `THIRD_PARTY_NOTICES.md` at the repository root.
