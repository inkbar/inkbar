# @inkbar/engine

The PDF engine behind Inkbar. It is built on PDFium, compiled to WebAssembly.

This package is not published yet. Its build downloads a prebuilt PDFium archive and checks it against the SHA-256 in `pdfium.lock.json`. For offline builds, set `INKBAR_PDFIUM_ARCHIVE` to a local copy of that archive.

## API and lifetimes

`createEngine()` starts one PDFium instance. In a browser it runs in a Web Worker; pass `worker: false` to run it in the calling thread. Every call returns a promise. Calls run one at a time, in the order they were made.

```ts
import { createEngine, EngineError } from '@inkbar/engine'

const engine = await createEngine()
try {
  const doc = await engine.open(bytes, { password })
  const { width } = await doc.pageInfo(0)
  const page = await doc.renderPage(0, { scale: 800 / width })
  context.putImageData(new ImageData(page.data, page.width, page.height), 0, 0)
  const saved = await doc.save({ mode: 'incremental' })
  await doc.close()
} catch (error) {
  if (error instanceof EngineError && error.code === 'password-required') askForPassword()
  else throw error
} finally {
  await engine.destroy()
}
```

Units and orientation:

- `pageInfo` gives the width and height in PDF points (1/72 inch) of the page box PDFium reports, before /Rotate. `rotation` is the page's /Rotate in degrees.
- `renderPage` returns the page in displayed orientation, after /Rotate. The bitmap is the displayed size times `scale`, rounded up to whole pixels. The data is straight RGBA and opaque. The largest bitmap is 268,435,456 pixels.

Ownership and lifetimes:

- `open` copies the bytes when it is called. The caller keeps its array.
- `renderPage` and `save` return buffers that belong to the caller.
- `'rewrite'` writes a complete file. `'incremental'` appends the changes to the original bytes. Saving keeps the document's encryption.
- An open document holds engine memory until `close()` or `destroy()`. Engine memory does not shrink; closing a document lets the engine reuse it.
- `destroy()` waits for the running call, rejects queued calls with `aborted` and closes every document. A `close()` after `destroy()` resolves.
- A `signal` cancels a call only while it waits in the queue.

Errors:

- Engine calls reject with an `EngineError`. Its `code` is `password-required`, `password-incorrect`, `invalid-pdf`, `unsupported-security`, `out-of-memory`, `aborted` or `engine-failure`.
- A page index outside the document or a scale that is not a finite number above 0 rejects with a `RangeError`.
- After an internal error in PDFium the engine stops. Every later call rejects with `engine-failure`. Create a new engine.
