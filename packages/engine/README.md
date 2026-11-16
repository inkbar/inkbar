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

- `pageInfo` gives the width and height in PDF points (1/72 inch) of the page box PDFium reports, before /Rotate. That box is the crop box intersected with the media box, or the media box when there is no crop box. `rotation` is the page's /Rotate in degrees.
- `renderPage` returns the page in displayed orientation, after /Rotate. The bitmap is the displayed size times `scale`, rounded up to whole pixels. The data is straight RGBA and opaque. The largest bitmap is 268,435,456 pixels.

Ownership and lifetimes:

- `open` copies the bytes when it is called. The caller keeps its array.
- `renderPage` and `save` return buffers that belong to the caller.
- `'rewrite'` writes a complete file. `'incremental'` appends the changes to the original bytes. Saving keeps the document's encryption.
- An open document holds engine memory until `close()` or `destroy()`. Engine memory does not shrink; closing a document lets the engine reuse it.
- `destroy()` rejects queued calls with `aborted` and closes every document. In a worker it waits up to two seconds for the running call, then stops the worker; a call still running then rejects with `aborted`. In the calling thread it waits for the running call to finish. A `close()` after `destroy()` resolves.
- A `signal` cancels a call only while it waits in the queue. A call that has started runs to the end and may still reject.

Errors:

- Engine calls reject with an `EngineError`. Its `code` is `password-required`, `password-incorrect`, `invalid-pdf`, `unsupported-security`, `out-of-memory`, `aborted` or `engine-failure`.
- A `RangeError` means a page index outside the document, a scale that is not a finite number above 0, or a render larger than 268,435,456 pixels.
- After an internal error in PDFium the engine stops. Every later call rejects with `engine-failure`, except `close()` and `destroy()`, which still resolve. Create a new engine.
- `out-of-memory` does not always stop the engine. A bitmap that cannot be allocated leaves it working. An allocation failure that aborts PDFium stops it.
