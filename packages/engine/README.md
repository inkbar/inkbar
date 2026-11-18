<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-dark.svg">
    <img src="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-light.svg" alt="Inkbar" width="72" height="72">
  </picture>
</p>

<h1 align="center">@inkbar/engine</h1>

<p align="center">
  Opens, renders and writes PDFs for Inkbar, with PDFium compiled to WebAssembly.
</p>

<p align="center">
  <a href="https://inkbar.dev">Website</a> ·
  <a href="https://inkbar.dev/docs/">Docs</a> ·
  <a href="https://sandbox.inkbar.dev">Sandbox</a> ·
  <a href="https://github.com/inkbar/inkbar">GitHub</a>
</p>

---

`@inkbar/engine` writes annotations and form values into a PDF, applies redactions, and checks what is left under them. `@inkbar/core` uses it to save: Download, Print and `doc.save()` then hand over the file with the session's changes written in. Most hosts never call it directly. They install it and pass a loader to core:

```ts
const viewer = createViewer(el, {
  source,
  assets,
  engine: () => import('@inkbar/engine'),
})
```

The [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#saving-into-the-pdf) describes saving: what goes into the file, what comes back editable, and where the saved file differs from the screen.

## Install

```sh
pnpm add @inkbar/engine
```

The package holds a 6.7 MB WebAssembly binary (2.9 MB gzipped) and a worker script. Core loads them on the first save that has changes. A host that does not pass the loader bundles none of it.

## Serving the files

With Vite there is nothing to set up. The engine names its files with `new URL('./inkbar-pdfium.wasm', import.meta.url)` and `new Worker(new URL('./worker.mjs', import.meta.url))`, and a production build emits the wasm and a worker beside your code. The dev server serves them too, also when it pre-bundles the package, so you do not need `optimizeDeps.exclude`. Other bundlers that follow these two forms should emit the files the same way; Inkbar is tested with Vite only.

Without a bundler, or to serve the files from a path of your own, copy `dist/inkbar-pdfium.wasm` and `dist/worker.mjs` from the package and pass their URLs. `worker.mjs` imports nothing, so it can sit alone beside the wasm. A browser starts a worker only from the page's own origin. With core, wrap `createEngine` in the loader:

```ts
const engine = async () => {
  const { createEngine } = await import('@inkbar/engine')
  return {
    createEngine: () =>
      createEngine({ wasm: '/pdf/inkbar-pdfium.wasm', worker: '/pdf/worker.mjs' }),
  }
}
```

Two things to know about this wrapper:

- In a bundled app, `index.mjs` still holds the engine's own `new URL(...)` forms, so the bundler still emits the default wasm and worker beside your copies. The wrapper changes which files load; the build contains both sets.
- Without a bundler, the browser cannot resolve the bare name `@inkbar/engine`. Map it with an import map, or import `dist/index.mjs` by its full URL.

In Node (22.3 or later) the engine runs in the calling thread and reads the wasm from the package on disk.

## What it does not do

- It does not embed fonts. An appearance can name the twelve standard PDF fonts, and each viewer draws those with its own equivalent.
- It does not support XFA forms, and it runs no form scripts.
- It does not clean hidden layers when it redacts.

## API and lifetimes

`createEngine()` starts one PDFium instance. In a browser it runs in a Web Worker; pass `worker: false` to run it in the calling thread. `wasm` and `worker` take URLs (or the wasm's bytes, or a `Worker`) in place of the files beside the module. Every call returns a promise. Calls run one at a time, in the order they were made.

```ts
import { createEngine, EngineError } from '@inkbar/engine'

const engine = await createEngine()
try {
  const doc = await engine.open(bytes, { password })
  const { width } = await doc.pageInfo(0)
  const page = await doc.renderPage(0, { scale: 800 / width })
  context.putImageData(new ImageData(page.data, page.width, page.height), 0, 0)
  await doc.write({ annotations, fields })
  const saved = await doc.save()
  await doc.close()
} catch (error) {
  if (error instanceof EngineError && error.code === 'password-required') askForPassword()
  else throw error
} finally {
  await engine.destroy()
}
```

Units and orientation:

- `pageInfo` gives the width and height in PDF points (1/72 inch) of the page box PDFium reports, before /Rotate. That box is the crop box intersected with the media box, or the media box when there is no crop box. `box` is the same box as `{ x, y, width, height }` in user space; its origin is the crop box's corner, so it is not always (0, 0). `rotation` is the page's /Rotate in degrees.
- `renderPage` returns the page in displayed orientation, after /Rotate. The bitmap is the displayed size times `scale`, rounded up to whole pixels. The data is straight RGBA and opaque. The largest bitmap is 268,435,456 pixels. It draws the page's annotations unless you pass `annotations: false`.

Writing:

- `write({ remove, annotations, fields })` sets each form value in `fields` and redraws its widgets, removes the annotations in `remove`, by page and object number, then appends each annotation to its page in the order given.
- Each annotation is a [Gloss](https://gloss-format.org) annotation (`gloss-format`), from which its PDF dictionary is written, plus an `Appearance`, which is how it looks, and a `data` string stored with it. The engine does not draw annotations: producing the appearance is the caller's job, and core's when you save through core.
- An `Appearance` gives the bounds, which become the annotation's rectangle, the drawing operators in user space, and the resources they name: standard fonts, opacities, PNG or JPEG images, pages of the same document, and nested forms. Resource names are made of A-Z, a-z and 0-9.
- A reply (an annotation with `inReplyTo`) is a hidden note linked to its parent, and needs no appearance. The parent must come earlier in `annotations` of the same call. To reply to an annotation already in the file, pass `replyTo` with its page and object number instead; if that annotation is not on the page, the write fails naming the reply.
- `fields` maps a field's full name to its `value`: a string for a text field or combo box (`''` clears a combo box), the state name of the button to turn on (or `'Off'`) for a checkbox or radio group, and a list of export values for a list box. `text` is what a text field or combo box shows in place of the value, such as `'$1,234.50'` for `'1234.5'`. The engine draws the widget its own way.
- Every `write` starts from the document as opened, so a second call replaces the first. `save` then gives the written file.
- A file's permission flags do not stop a write.

Saving:

- `save()` rewrites the whole file, except when the document holds a digital signature: then it appends the changes after the original bytes, so the signature can still be verified. An empty signature field does not count. Pass `mode: 'rewrite'` or `mode: 'incremental'` to choose.
- After a `redact`, `save()` always rewrites the whole file, signed or not, and `mode: 'incremental'` is a `RangeError`: an appended save would keep the original bytes, and with them everything the redaction removed.
- Saving keeps the document's encryption and its password.

Ownership and lifetimes:

- `open` and `checkRedaction` copy the bytes when they are called. The caller keeps its array. `write` copies its input the same way.
- `renderPage` and `save` return buffers that belong to the caller.
- An open document holds engine memory until `close()` or `destroy()`. Engine memory does not shrink; closing a document lets the engine reuse it.
- `destroy()` rejects queued calls with `aborted` and closes every document. In a worker it waits up to two seconds for the running call, then stops the worker; a call still running then rejects with `aborted`. In the calling thread it waits for the running call to finish. A `close()` after `destroy()` resolves.
- A `signal` cancels a call only while it waits in the queue. A call that has started runs to the end and may still reject.

Errors:

- Engine calls reject with an `EngineError`. Its `code` is `password-required`, `password-incorrect`, `invalid-pdf`, `unsupported-security`, `out-of-memory`, `write-failed`, `redaction-failed`, `check-failed`, `aborted` or `engine-failure`.
- `write-failed` means part of a `write` could not be written. The message names the annotation or the field, and for an annotation the error's `annotation` holds its id. The document is left as it was opened and the engine keeps working.
- `redaction-failed` means `redact` could not remove an annotation, load a page, write a mark, apply the marks of a page, read the file's report, or sanitise the file. The error's `page` holds the page index, and `annotation` holds the mark's id when writing one mark failed. Marks on a page are applied together, so a failure while applying names the page only. The document is left as it was opened and the engine keeps working.
- `check-failed` means `checkRedaction` could not inspect a page or the file. The error's `page` holds the page index when a page was the cause. Treat it as a failed check. The engine keeps working.
- A `RangeError` means a `write` after a `redact`, an incremental save after a `redact`, a page index outside the document, a scale that is not a finite number above 0, a render larger than 268,435,456 pixels, a resource name in an appearance outside A-Z, a-z and 0-9, an appearance whose bounds have no width or no height, or a field value that is not a string or a list of strings. For `checkRedaction` it means a region on a page the file does not have, a region with no quads, or a quad with a number that is not finite.
- `engine-failure` also covers a wasm or worker that could not be loaded; the message names the URL.
- After an internal error in PDFium the engine stops. Every later call rejects with `engine-failure`, except `close()` and `destroy()`, which still resolve. Create a new engine.
- `out-of-memory` does not always stop the engine. A bitmap that cannot be allocated leaves it working. An allocation failure that aborts PDFium stops it.

## Redacting

`redact()` removes content from the file for good:

```ts
const result = await doc.redact({ remove, marks, annotations, fields })
const redacted = await doc.save()
```

Each of `marks` is a Gloss `redact` annotation with an `appearance`, written as `write` writes annotations. Under each mark the engine removes:

- text: every character whose box overlaps the mark,
- images: the samples under the mark, which become blank,
- drawing: paths and shadings, cut to the mark's shape,
- annotations the mark overlaps, with their pop-ups, and the form fields of widgets it removes.

A mark covers its Gloss `quads`, or its `rect` when it has none. Its appearance bounds play no part: they may be padded for an outline. The appearance becomes part of the page in the mark's place, and no annotation remains. The engine skips a mark with no area, or one that lies wholly outside the page's crop box.

The engine does not enter tiling patterns, so content inside one stays.

`redact` works in this order, starting from the document as opened, as `write` does:

1. Removes the annotations in `remove`.
2. Writes the marks and applies them, page by page.
3. Writes `annotations`, so an annotation that copies a page, such as a loupe, copies the redacted page.
4. Writes `fields`, skipping any field whose widgets a mark removed.
5. Sanitises the file. It removes the document information dictionary and XMP metadata, attached files, JavaScript and script actions, page thumbnails, and private application data (`/PieceInfo`). A form's calculations and validation are scripts, so a redacted form no longer calculates.

In an encrypted file, Inkbar's own earlier marks come back locked. The engine knows them by the data stored with them and applies them as well. Redact annotations from other programs stay in the file, unapplied.

The result holds counts, flags and places, and no text from the file:

- `pages`: for each page where marks were applied, the number of marks and the number of other annotations they removed, pop-ups included.
- `ownLockedMarks`: Inkbar's earlier locked marks it applied.
- `ownLockedRegions`: the page and quads of each of those marks, read before the apply, for `checkRedaction` to check beside the regions of `marks`.
- `foreignMarks`: other programs' Redact annotations left in the file, counted on every page.
- `fieldsSkipped`: the names of the `fields` it skipped.
- `sanitised`: what sanitising found and removed: `metadata`, `attachments` (a count), `scripts`, `thumbnails` and `privateData`.
- `hiddenLayers`: the file has layers that are hidden. Redacting does not clean them.
- `signed`: the file holds a digital signature. The rewritten file's signature no longer verifies.

`redact` rejects with `redaction-failed` when it cannot remove an annotation in `remove`, load a page, write a mark, apply the marks of a page, read the file's report on layers and signatures, or sanitise the file. The annotations and fields it writes after the apply reject with `write-failed`, as in `write`, and so does a field name that the opened file never had. Either way the engine leaves the document as it was opened.

A second `redact` starts again from the document as opened. A `write` after a `redact` rejects with a `RangeError`, since it would start from the opened bytes and undo the redaction. To add to a redacted file, save it and open the saved bytes as a new document.

## Checking a redaction

`checkRedaction()` reports what is left under redactions in any PDF. It takes the file's bytes and needs no open document:

```ts
const findings = await engine.checkRedaction(bytes, { password, regions })
```

It reads the objects on the page. An opaque box hides what lies under it from a render, so a picture of the page proves nothing; the check counts the objects under the box.

It has two uses:

- With `regions`, it checks the places you name. Each region is a page index and one or more Gloss quads (`p1` top left, `p2` top right, `p3` bottom left, `p4` bottom right), in PDF user space. Pass a redaction's own mark quads to check the file it produced.
- Without `regions`, it looks for candidates itself: Redact annotations, filled boxes in the page content, and Square, Highlight and Stamp annotations drawn as one opaque filled box. This is the use for a file from elsewhere.

The engine copies `bytes`, loads them on their own and closes them before the call resolves, so documents it has open stay as they were. The call waits in the same queue as every other call.

### Findings

```ts
{
  candidates: [
    {
      page: 0,
      rect: { x: 45, y: 190, width: 170, height: 35 },
      kind: 'filled-box',
      text: 'present',
      image: 'none',
      drawing: 'none',
      verdict: 'content-remains',
    },
  ],
  file: {
    earlierVersions: 0,
    metadata: false,
    attachments: 0,
    scripts: false,
    hiddenLayers: false,
    signed: false,
  },
}
```

Findings hold places, counts and flags, and never text from the file. They are plain data, so you can send them to a worker or store them as JSON.

Each candidate:

- `page` and `rect`: where it is, in PDF user space. A region's `rect` is the bounds of its quads.
- `kind`: `region` for a region you gave, `redact-annotation`, `filled-box`, or `annotation-box`.
- `text`: `present` when a character lies under it: in the page content, in a Form XObject at any depth, in the appearance of an annotation that meets it, or inside a tiling pattern painted into it. An image inside such a pattern counts here too.
- `image`: `present` when an image under it, inline images and the images in annotation appearances included, has samples there that are not one value.
- `drawing`: `present` when a path or shading crosses it. A filled box and an annotation box are drawing themselves, so for them `drawing` is always `none`.
- `verdict`: `unapplied` for a Redact annotation with anything under it, `content-remains` for any other candidate with anything under it, and `clean` when the check found nothing under it.

`candidates` lists page by page. On a page, regions come in the order you gave them, and candidates the check found come in the file's order. With an empty `regions` list the check looks at no page.

`file` describes what the file carries besides its pages:

- `earlierVersions`: revisions kept before the last. An appended save keeps the earlier bytes, and they may hold what a later revision removed.
- `metadata`: the file has a document information dictionary or XMP metadata.
- `attachments`: the number of attached files.
- `scripts`: the file holds JavaScript or script actions.
- `hiddenLayers`: the file has layers that are hidden.
- `signed`: the file holds a digital signature.

A candidate that is not `clean` is a finding, and the call still resolves. Say what the check found or did not find. Never call a file "safe" or "secure" because of it: `clean` means the check found nothing under that place, within the limits below.

### Rules and thresholds

The check follows the apply's own edge rules, so content the apply rightly kept beside a mark does not fail it.

- A character counts when its glyph box, from the font's glyph bounds, overlaps a region on an open interval. A glyph that only touches the edge does not count. A second test reads the boxes text extraction gives, which are wider, against the region shrunk by 1 pt on every side (by a quarter of its smaller side, when that is less).
- An image counts when its samples over the region's bounding box on the image's sample grid are not one value. A lossless image allows no difference. After JPEG or JPEG 2000 compression a sample may differ by 12 levels per 8-bit channel, and by 24 within 8 samples of the edge of the blanked area, where re-encoding blurs the kept content into it. An image that cannot be decoded counts.
- A path or shading counts when it crosses the region shrunk by 0.01 pt. A second test samples each path at most 1 pt apart against the region shrunk by 1 pt.
- With regions, the overlay an apply leaves in place of a mark is tagged `/INKB_Overlay`, and nothing inside it counts. Without regions the tag does not count for anything, and content in tagged overlays is checked like any other.
- A filled box is a candidate when it is at least 4 pt in each direction, opaque, with normal blending, and its fill luminance is below 0.2 or above 0.98. Only content painted before a candidate counts as under it: page content in content order, then annotations in `/Annots` order. So text drawn over a white background is not under the background.

### Limits

- A filled box with nothing under it is `clean`. It may be a real redaction or a graphic, and the check cannot tell which.
- Without regions, the check reports only candidates it recognises. A redaction it does not recognise as one is not reported.
- An image area of one flat colour is blank to the check. A solid-colour area left under a region does not fail it.
- A scanned page is one image. The check sees whether the samples under a region are blank; it does not read words in a picture.
- The removed words may also appear where the check does not look: bookmark titles, comments on other annotations, form values, and alternate text for screen readers.
- The check reports hidden layers, and the apply does not clean them.
- Vector drawing inside a tiling pattern does not count. Text and images inside one do.
- A linearized file counts as two revisions, so `earlierVersions` is 1 for a linearized file saved once.

It rejects with `password-required`, `password-incorrect`, `invalid-pdf` or `unsupported-security` as `open` does. It rejects with `check-failed` when it could not inspect a page or the file, for example when forms are nested too deep to read; `page` names the page. That is never a finding of nothing: treat it as a failed check. A region on a page the file does not have, a region with no quads, or a quad with a number that is not finite rejects with a `RangeError`.

## Building from source

The build downloads a prebuilt PDFium archive and checks it against the SHA-256 in `pdfium.lock.json`. For offline builds, set `INKBAR_PDFIUM_ARCHIVE` to a local copy of that archive.

## Licence

[MIT](https://github.com/inkbar/inkbar/blob/main/LICENSE). The WebAssembly binary is PDFium and the libraries linked into it, such as FreeType, libjpeg-turbo, OpenJPEG and zlib, each under its own licence. `dist/THIRD-PARTY-NOTICES` in the package carries all of them. From the team behind [Redactr](https://redactr.io).
