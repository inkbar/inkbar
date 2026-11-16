# @inkbar/engine

The PDF engine behind Inkbar. It is built on PDFium, compiled to WebAssembly.

This package is not published yet. Its build downloads a prebuilt PDFium archive and checks it against the SHA-256 in `pdfium.lock.json`. For offline builds, set `INKBAR_PDFIUM_ARCHIVE` to a local copy of that archive.
