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

The package holds a 6.9 MB WebAssembly binary (2.9 MB gzipped) and a worker script. Core loads them on the first save that has changes, or on the first apply of redactions. A host that does not pass the loader bundles none of it.

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

## Fallback fonts

Some PDFs name a font without embedding it. The engine has no system fonts. It draws the standard Latin fonts, such as Helvetica, Times and Arial, from its own set. Japanese, Chinese, Korean, Cyrillic or Greek text in a font the file does not carry needs a font from you, or the engine draws it wrong or leaves it out.

Pass `fallbackFonts`: for each key, a URL, a file path in Node, or the font's bytes.

| Key                   | Text it draws                                                      |
| --------------------- | ------------------------------------------------------------------ |
| `japanese`            | Japanese                                                           |
| `simplified-chinese`  | Simplified Chinese                                                 |
| `traditional-chinese` | Traditional Chinese                                                |
| `korean`              | Korean                                                             |
| `default`             | Cyrillic, Greek and other scripts the four keys above do not cover |

[`@inkbar/fonts`](https://www.npmjs.com/package/@inkbar/fonts) ships a font for each key. Each Chinese, Japanese or Korean font is 4 to 8 MB. Serve the package's `files/` directory and pass its URL:

```ts
import { fontUrls } from '@inkbar/fonts'

const engine = await createEngine({ fallbackFonts: fontUrls('/fonts/') })
```

- The engine fetches a font the first time a page needs it, before it draws, writes to or redacts that page. It fetches each font once per engine. A `write` that sets form values, and every `redact`, first checks the fonts of every page.
- A field whose font is named only in the form's `/DR`, and used by no page, is not covered: the engine does not fetch that font before it redraws the field.
- A file that embeds its fonts, or names only the standard Latin fonts, fetches nothing. With no `fallbackFonts`, the engine fetches nothing.
- Besides its wasm and worker, these fonts are the only files the engine requests, and only from the URLs you give. In a worker the engine fetches them itself, after resolving relative URLs against the page.
- `renderPage` returns `missingFonts`: the keys the page needed and did not get, because you gave none or the fetch failed. The engine still draws the page.
- The engine does not retry a failed fetch while it runs. A fetch fails on a network error, a status other than 2xx, or a file that is not a font.
- Bytes you pass are read when a page first needs them, so leave them unchanged.

## What it does not do

- It does not embed fonts. An appearance can name the twelve standard PDF fonts, and each viewer draws those with its own equivalent.
- It does not support XFA forms, and it runs no form scripts.
- It does not clean hidden layers when it redacts.
- It cannot remove some content painted through a reference, such as a tiling pattern, so it refuses a mark over that content (see [Redacting](#redacting)).

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

- `pageInfo` gives the width and height of the page box PDFium reports, before /Rotate. That box is the crop box intersected with the media box, or the media box when there is no crop box. `box` is the same box as `{ x, y, width, height }` in user space; its origin is the crop box's corner, so it is not always (0, 0). `rotation` is the page's /Rotate in degrees. `userUnit` is the page's /UserUnit, the size of one user-space unit in points, or 1 when the page has none.
- `width`, `height` and `box` are in user-space units: multiply by `userUnit` for points. A page with `/UserUnit 2` and a 612 by 792 box reports 612 by 792 and is 1224 by 1584 points.
- `renderPage` returns the page in displayed orientation, after /Rotate. The bitmap is the displayed size times `scale`, rounded up to whole pixels. `scale` is pixels per user-space unit. The data is straight RGBA and opaque. The largest bitmap is 268,435,456 pixels. It draws the page's annotations, form widgets included, unless you pass `annotations: false`.
- `region` draws part of the page: a rectangle in user space, like `box`. The part of it outside the page box is white. At the same `scale`, with edges that fall on whole pixels, a region's bitmap is the same pixels as that part of the whole-page bitmap.
- `size` asks for an exact bitmap, `{ width, height }` in whole pixels from 1, in place of `scale`. `renderPage` stretches the region, or the whole page, to fill it, so each side may scale differently. It rounds the page's edges to the nearest pixel, so a region may sit up to half a pixel off a cut from a whole-page bitmap. Passing both `scale` and `size` is a `RangeError`.
- `rotation` turns the result a further 90, 180 or 270 degrees clockwise on top of /Rotate.
- `hide` lists the object numbers of annotations on the page to leave out, so annotations you draw yourself appear once. It takes up to 1,000,000 numbers. The document stays as it was, and a later `save` writes the same file.

```ts
// The page's top-left inch as a 256 by 256 tile, turned a quarter with the view,
// without the annotation in object 12.
const { box } = await doc.pageInfo(0)
const tile = await doc.renderPage(0, {
  region: { x: box.x, y: box.y + box.height - 72, width: 72, height: 72 },
  size: { width: 256, height: 256 },
  rotation: 90,
  hide: [12],
})
```

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

- `open` and `checkRedaction` copy the bytes when they are called. The caller keeps its array. `write` copies its input the same way, and `renderPage` its options. Input that `structuredClone` cannot copy, such as a function, rejects with a `DataCloneError`.
- `renderPage` and `save` return buffers that belong to the caller. In a worker, the engine moves the pixels to your thread without copying them.
- An open document holds engine memory until `close()` or `destroy()`. Engine memory does not shrink; closing a document lets the engine reuse it.
- `destroy()` rejects queued calls with `aborted`, stops a running render and closes every document. In a worker it waits up to two seconds for any other running call, then stops the worker; a call still running then rejects with `aborted`. In the calling thread it waits for any other running call to finish. A `close()` after `destroy()` resolves.
- A `signal` cancels a call while it waits in the queue. On `renderPage` it also stops a render that has started. The engine draws in steps of about 8 ms and checks the signal between them, so the render rejects with `aborted` a few milliseconds after you abort, and you get no pixels. Some pages take longer steps. A render that finishes before the engine sees the abort still resolves. An abort while the render waits for a fallback font also rejects with `aborted`; the font is fetched again next time. Other calls that have started run to the end and may still reject.

Errors:

- Engine calls reject with an `EngineError`. Its `code` is `password-required`, `password-incorrect`, `invalid-pdf`, `unsupported-security`, `out-of-memory`, `write-failed`, `redaction-failed`, `check-failed`, `aborted` or `engine-failure`.
- `write-failed` means part of a `write` could not be written. The message names the annotation or the field, and for an annotation the error's `annotation` holds its id. The document is left as it was opened and the engine keeps working.
- `redaction-failed` means `redact` refused a mark before changing anything (its `reason` says why; see [Redacting](#redacting)), or could not remove an annotation, load a page, write a mark, apply the marks of a page, read the file's report, or sanitise the file. The error's `page` holds the page index, and `annotation` holds the mark's id when writing one mark failed. Marks on a page are applied together, so a failure while applying names the page only. The document is left as it was opened and the engine keeps working.
- `check-failed` means `checkRedaction` could not inspect a page or the file. The error's `page` holds the page index when a page was the cause. Treat it as a failed check. The engine keeps working.
- A `RangeError` means a `write` after a `redact`, an incremental save after a `redact`, a page index outside the document, a scale that is not a finite number above 0, `scale` and `size` together, a size that is not two whole numbers from 1, a region whose width or height is not a finite number above 0, a rotation other than 0, 90, 180 or 270, a `hide` entry that is not a whole number from 1, a render larger than 268,435,456 pixels, a resource name in an appearance outside A-Z, a-z and 0-9, an appearance whose bounds have no width or no height, or a field value that is not a string or a list of strings. For `checkRedaction` it means a region on a page the file does not have, a region with no quads, or a quad with a number that is not finite as a 32-bit float.
- `engine-failure` also covers a wasm or worker that could not be loaded; the message names the URL.
- After an internal error in PDFium the engine stops. Every later call rejects with `engine-failure`, except `close()` and `destroy()`, which still resolve. Create a new engine.
- `out-of-memory` does not always stop the engine. A bitmap that cannot be allocated leaves it working. An allocation failure that aborts PDFium stops it.

## Redacting

`redact()` removes the content under the marks from the file it saves, within the limits listed below:

```ts
const result = await doc.redact({ remove, marks, annotations, fields })
const redacted = await doc.save()
```

Each of `marks` is a Gloss `redact` annotation with an `appearance`, written as `write` writes annotations. Under each mark the engine removes:

- text: every character whose box overlaps the mark,
- images: the samples under the mark's bounding box, which become blank (for a turned mark the box is wider than the mark),
- drawing: paths and shadings, cut to the mark's shape,
- annotations the mark overlaps, with their pop-ups, and the form fields of widgets it removes.

A mark covers its Gloss `quads`, or its `rect` when it has none. Its appearance bounds play no part: they may be padded for an outline. The appearance becomes part of the page in the mark's place, tagged `/INKB_Overlay` so a check can tell it from content, and no annotation remains. The engine skips a mark with no area, or one that lies wholly outside the page's crop box.

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

Before it changes anything, `redact` looks under each mark, and under Inkbar's earlier marks in an encrypted file, for content the apply cannot remove. The apply removes text, blanks image samples and cuts paths. It cannot rewrite content that the file defines once and paints through a reference, so cutting the shape that paints it would leave that content in the file. The engine refuses a mark that touches a shape painted with a tiling pattern, a picture gradient (a mesh or function-based gradient, or a linear or radial gradient whose colour function is not a simple ramp), artwork under a soft mask that holds more than a simple fade, or a Type 3 glyph that paints outside the box it declares. A simple ramp blends from colour to colour in at most eight stretches. A simple fade is a soft mask made of at most four plain rectangles or simple-ramp gradients, which is how gradient transparency is drawn. Hatching and textures are tiling patterns, and drop shadows and feathered edges are usually drawn with soft masks that hold more than a fade. Covering the whole shape does not help. Content under a simple fade, and linear and radial gradients with a simple ramp, are redacted.

A refusal rejects with `redaction-failed` and leaves the document as it was opened. The error's `reason` is `'unremovable-content'`, `marks` holds the ids of every mark over such content on every page, `kinds` lists what was found (`'pattern'`, `'shading'`, `'mask-group'`, `'glyph'`) and `page` is the first page with one. Inkbar's earlier marks have no id there; `page` names their page. Move or delete those marks, then redact again. When the engine cannot look under the marks, as when a page needs more work than the inspection allows, the `reason` is `'could-not-inspect'`.

`redact` rejects with `redaction-failed` when it cannot remove an annotation in `remove`, load a page, write a mark, apply the marks of a page, read the file's report on layers and signatures, or sanitise the file. The annotations and fields it writes after the apply reject with `write-failed`, as in `write`, and so does a field name that the opened file never had. Either way the engine leaves the document as it was opened.

A second `redact` starts again from the document as opened. A `write` after a `redact` rejects with a `RangeError`, since it would start from the opened bytes and undo the redaction. To add to a redacted file, save it and open the saved bytes as a new document.

## Checking a redaction

`checkRedaction()` reports what it finds under redactions in any PDF. It takes the file's bytes and needs no open document:

```ts
const findings = await engine.checkRedaction(bytes, { password, regions })
```

It reads the objects on the page. An opaque box hides what lies under it from a render, so a picture of the page proves nothing; the check counts the objects under the box.

It has two uses:

- With `regions`, it checks the places you name. Each region is a page index and one or more Gloss quads (`p1` top left, `p2` top right, `p3` bottom left, `p4` bottom right), in PDF user space. Pass a redaction's own mark quads to check the file it produced. This use trusts the `/INKB_Overlay` tag the apply puts on its overlays, so it proves nothing about a file the engine did not just produce.
- Without `regions`, it looks for candidates itself: Redact annotations, filled boxes in the page content, and Square, Highlight and Stamp annotations drawn as one opaque filled box. This is the use for a file from elsewhere.

The engine copies `bytes`, loads them on their own and closes them before the call resolves, so documents it has open stay as they were. The call waits in the same queue as every other call. An inspection runs to the end, and a crafted file can make it take a long time. Check files from elsewhere on an engine of their own, in their own worker, with a timeout, and call `destroy()` on that engine when the timeout fires. On a shared engine such a file holds up every document it has open.

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
- `region`: for a region you gave, its index in your `regions` list. Other kinds have none.
- `kind`: `region` for a region you gave, `redact-annotation`, `filled-box`, or `annotation-box`.
- `text`: `present` when a character lies under it: in the page content, in a Form XObject at any depth, in the appearance of an annotation that meets it, or inside a tiling pattern painted into it. An image inside such a pattern counts here too, and drawing inside one counts under `drawing`.
- `image`: `present` when an image under it, inline images and the images in annotation appearances included, has samples there that are not one value.
- `drawing`: `present` when a path or shading crosses it. A filled box and an annotation box are drawing themselves, so for them `drawing` is always `none`.
- `verdict`: `unapplied` for a Redact annotation with anything under it, `content-remains` for any other candidate with anything under it, and `clean` when the check found nothing under it.

`candidates` lists page by page. On a page, regions come in the order you gave them, and candidates the check found come in the file's order. Use `region` to match a candidate to the region you asked about. With an empty `regions` list the check looks at no page.

`file` describes what the file carries besides its pages:

- `earlierVersions`: revisions kept before the last. An appended save keeps the earlier bytes, and they may hold what a later revision removed. A linearized file is one revision, and 0 here until something is appended to it.
- `metadata`: the file has a document information dictionary or XMP metadata.
- `attachments`: the number of attached files.
- `scripts`: the file holds JavaScript or script actions.
- `hiddenLayers`: the file has layers that are hidden.
- `signed`: the file holds a digital signature.

A candidate that is not `clean` is a finding, and the call still resolves. Say what the check found or did not find. Never call a file "safe" or "secure" because of it: `clean` means the check found nothing under that place, within the limits below.

### Rules and thresholds

The check follows the apply's own edge rules, so content the apply rightly kept beside a mark does not fail it.

- A character counts when its glyph box, from the font's glyph bounds, overlaps a region on an open interval. A glyph that only touches the edge does not count. A second test reads the boxes text extraction gives, which are wider, against the region shrunk by 1 pt on every side (by a quarter of its smaller side, when that is less).
- An image counts when its samples over the region's bounding box on the image's sample grid are not blank. With regions, blank means the value the apply fills a hole with, so a solid area of any other colour counts. Without regions, any one flat value is blank. A lossless image allows no difference. After JPEG or JPEG 2000 compression a sample may differ by 12 levels per 8-bit channel. In a JPEG block that the region's edge crosses (8 by 8 samples, or 16 by 16 when the colour is subsampled), a sample may lie 48 levels from the fill, because the apply re-encodes those blocks and the kept content beside the hole blurs into them. An image that cannot be decoded counts.
- A path or shading counts when it crosses the region shrunk by 0.01 pt. A second test samples each path at most 1 pt apart against the region shrunk by 1 pt.
- What an object paints with counts when the object paints under the region: the cell of a tiling pattern, a picture gradient (see [Redacting](#redacting)), and the group of a soft mask. Their text, images and drawing count in the same fields as the page's own.
- Text and images inside an annotation's appearance count. Drawing inside one does not, unless the appearance is a loupe's copy of its page: the apply removes every annotation whose rectangle meets a mark, and an appearance cannot paint outside its rectangle. Everything inside a loupe's page copy counts, read in the page's own coordinates.
- With regions, the overlay an apply leaves in place of a mark is tagged `/INKB_Overlay`, and nothing inside it counts. Without regions the tag does not count for anything, and content in tagged overlays is checked like any other.
- A filled box is a candidate when it is at least 4 pt in each direction, opaque, with normal blending, and its fill luminance is below 0.2 or above 0.98. Only content painted before a candidate counts as under it: page content in content order, then annotations in `/Annots` order. So text drawn over a white background is not under the background.

### Limits

- A check with `regions` trusts the `/INKB_Overlay` tag and counts nothing inside a tagged form. Any file can carry the tag, so a check with regions proves nothing about a file the engine did not just produce. Check a file from elsewhere without regions.
- A filled box with nothing under it is `clean`. It may be a real redaction or a graphic, and the check cannot tell which.
- Without regions, the check reports only candidates it recognises. A redaction it does not recognise as one is not reported.
- Without regions, an image area of one flat colour is blank to the check, so a solid-colour area left under a box does not fail it.
- In the JPEG blocks a region's edge crosses, the check does not see content within 48 levels of the fill.
- The check does not look at an alpha channel stored inside a JPEG 2000 image, or at colour-key masks.
- Without regions, the check does not see the content of a pattern, soft mask or gradient that another tool cut away from under a box. The cut fill no longer paints under the box, and the file cannot say that it once did.
- The check answers what lies under each place. It does not find copies hidden elsewhere in the file: a second use of the same graphic that is cropped, covered or on another page, or a pattern or gradient that another page also uses.
- A scanned page is one image. The check sees whether the samples under a region are blank; it does not read words in a picture.
- The removed words may also appear where the check does not look: bookmark titles, comments on other annotations, form values, and alternate text for screen readers.
- The check reports hidden layers, and the apply does not clean them.

It rejects with `password-required`, `password-incorrect`, `invalid-pdf` or `unsupported-security` as `open` does. It rejects with `check-failed` when it could not inspect a page or the file, for example when forms are nested too deep to read; `page` names the page. That is never a finding of nothing: treat it as a failed check. A region on a page the file does not have, a region with no quads, or a quad with a number that is not finite as a 32-bit float rejects with a `RangeError`.

## Building from source

The build downloads a prebuilt PDFium archive and checks it against the SHA-256 in `pdfium.lock.json`. For offline builds, set `INKBAR_PDFIUM_ARCHIVE` to a local copy of that archive.

## Licence

[MIT](https://github.com/inkbar/inkbar/blob/main/LICENSE). The WebAssembly binary is PDFium and the libraries linked into it, such as FreeType, libjpeg-turbo, OpenJPEG and zlib, each under its own licence. `dist/THIRD-PARTY-NOTICES` in the package carries all of them. From the team behind [Redactr](https://redactr.io).
