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

`@inkbar/engine` opens, draws and reads PDFs, writes annotations and form values into them, applies redactions, and checks what is left under them. `@inkbar/core` depends on it and reads every file with it, so a host that uses core, or the Vue, React or Svelte packages, does not install or import the engine: core's `assets` option says where its files are served from, and the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#serving-inkbars-files) covers that.

Use the engine directly to work with PDFs without Inkbar's viewer: to draw pages or read text in your own code, to write annotations, or to check a redacted file from elsewhere with [`checkRedaction`](#checking-a-redaction).

## Install

```sh
pnpm add @inkbar/engine
```

The package holds a 7.1 MB WebAssembly binary (3.0 MB gzipped) and a worker script.

## Serving the files

With Vite there is nothing to set up. The engine names its files with `new URL('./inkbar-pdfium.wasm', import.meta.url)` and `new Worker(new URL('./worker.mjs', import.meta.url))`, and a production build emits the wasm and a worker beside your code. The dev server serves them too, also when it pre-bundles the package, so you do not need `optimizeDeps.exclude`. Other bundlers that follow these two forms should emit the files the same way; Inkbar is tested with Vite only.

Without a bundler, or to serve the files from a path of your own, copy `dist/inkbar-pdfium.wasm` and `dist/worker.mjs` from the package and pass their URLs to `createEngine`. `worker.mjs` imports nothing, so it can sit alone beside the wasm. The files may be on another origin than the page, such as a CDN, when that origin sends CORS headers (`Access-Control-Allow-Origin`) for them. A browser does not start a worker from another origin's script, so the engine then starts the worker from a small `blob:` module of the page's own that imports `worker.mjs`; under a content security policy, `worker-src` must allow `blob:`.

```ts
import { createEngine } from '@inkbar/engine'

const engine = await createEngine({
  wasm: '/pdf/inkbar-pdfium.wasm',
  worker: '/pdf/worker.mjs',
})
```

Two things to know when you name the files yourself:

- In a bundled app, `index.mjs` still holds the engine's own `new URL(...)` forms, so the bundler still emits the default wasm and worker beside your copies. Import from [`@inkbar/engine/bare`](#naming-the-files-yourself) instead to leave them out.
- Without a bundler, the browser cannot resolve the bare name `@inkbar/engine`. Map it with an import map, or import `dist/index.mjs` by its full URL.

In Node (22.3 or later) the engine runs in the calling thread and reads the wasm from the package on disk.

## Naming the files yourself

`@inkbar/engine/bare` is for code that always passes its own wasm and worker, such as a library that depends on the engine and lets its host choose where the files live. `@inkbar/core` imports the engine this way and takes the URLs from its `assets` option. It exports what the main entry does, but `createEngine` has no default file locations and its built code holds no `new URL('./inkbar-pdfium.wasm', import.meta.url)` or worker form. A bundler therefore emits nothing for it, and a host that serves the files itself does not also ship a second copy of the 7 MB binary.

Both `wasm` and `worker` are required. `wasm` is a URL or the bytes, and `worker` is a URL, a `Worker` or `false` to run in the calling thread. Without one of them `createEngine` rejects with a `TypeError` that names it. Where there is no `Worker` global, such as Node, a URL for `worker` is ignored and the engine runs in the calling thread.

```ts
import { createEngine } from '@inkbar/engine/bare'

const engine = await createEngine({
  wasm: '/pdf/inkbar-pdfium.wasm',
  worker: '/pdf/worker.mjs',
})
```

## Fallback fonts

Some PDFs name a font without embedding it. The engine has no system fonts. It draws the standard Latin fonts, such as Helvetica, Times and Arial, from its own set. Japanese, Chinese, Korean, Cyrillic or Greek text in a font the file does not carry needs a font from you, or the engine draws it wrong or leaves it out. `@inkbar/core` passes the fonts named in its `assets` option, so a host that uses core has nothing to do here.

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

- The engine fetches a font the first time a page needs it, before it draws, reads the text of, writes to or redacts that page. It fetches each font once per engine. A `write` that sets form values, and every `redact`, first checks the fonts of every page.
- A field whose font is named only in the form's `/DR`, and used by no page, is not covered: the engine does not fetch that font before it redraws the field.
- A file that embeds its fonts, or names only the standard Latin fonts, fetches nothing. With no `fallbackFonts`, the engine fetches nothing.
- Besides its wasm and worker, these fonts are the only files the engine requests, and only from the URLs you give. In a worker the engine fetches them itself, after resolving relative URLs against the page.
- `renderPage` returns `missingFonts`: the keys the page needed and did not get, because you gave none, the fetch failed or it ran out of time. The engine still draws the page.
- `write` and `redact` do not say which fonts were missing. A host that redacts should run `checkRedaction` on the saved bytes; Inkbar's own `applyRedactions` does.
- The engine does not retry a failed fetch while it runs. A fetch fails on a network error, a status other than 2xx, or a file that is not a font.
- Each font is given 60 seconds. A fetch still going after that is stopped, and the call goes on without the font: the page is drawn, its text read, written or redacted with what there is, and `renderPage` lists the key in `missingFonts`. `pageText` does not report missing fonts. That font is not marked as failed, so the engine fetches it again the next time a page needs it. The document that went on without it keeps the substitute it loaded; other documents get the font.
- Every other call on the engine waits while a font is being fetched, as it waits behind any running call.
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
- `hide` lists annotations on the page to leave out, so annotations you draw yourself appear once. Name each by its object number, or by its place in the page's `/Annots` as `{ index }`. An annotation stored as a direct object has no number, so you name it by place. It takes up to 1,000,000 entries. The document stays as it was, and a later `save` writes the same file.

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

Drawing annotations alone:

- `renderAnnotations(index, { annotations, region, size, rotation })` draws the annotations you list, each by its `index` in the page's `/Annots`, onto a transparent bitmap. It places them as `renderPage` places the page for the same `region`, `size` and `rotation`. Lay the result over a page you rendered with those annotations in `hide` and you get the page as `renderPage` draws it with them, to within one level per channel, unless a flag the page render reads makes it skip one (see `drawn` below). The draw leaves out what falls past the page box, as `renderPage` does.
- The data is straight RGBA. Pixels you did not draw on are all zero.
- An entry's `state` picks a state of `/AP /N` to draw, such as `'Off'` or a checkbox's on-state, written one character per byte as `appearanceStates` gives it, up to 65,535 bytes. Without one you get the state `/AS` selects.
- `drawn` lists the places it drew. It leaves out an entry with nothing to draw: no dictionary at that place, a hidden annotation, a popup, a state `/AP /N` lacks, or a widget with no appearance the engine can make in memory. The call still resolves. The engine reads no other flag: an annotation flagged NoView, or of an unknown type flagged Invisible, draws here though `renderPage` skips it. Leave it out yourself if you lay the draw over the page.
- The engine writes nothing to the document, so a later `save` writes the same file. The call waits its turn in the queue behind a render of the same page, and `signal` cancels it as it cancels a render.

```ts
// A checkbox in both looks, to swap without drawing the page again.
const { box } = await doc.pageInfo(0)
const place = { region: box, size: { width: 1224, height: 1584 } }
const off = await doc.renderAnnotations(0, {
  ...place,
  annotations: [{ index: 8, state: 'Off' }],
})
const on = await doc.renderAnnotations(0, {
  ...place,
  annotations: [{ index: 8, state: 'Yes' }],
})
const page = await doc.renderPage(0, { ...place, hide: [{ index: 8 }] })
```

Reading text:

- `pageText(index)` gives a page's characters in the order PDFium reads them, with their boxes and fonts, all in user space before /Rotate. Text inside form XObjects is included. Text in annotation appearances is not. A page with a /Rotate is read in the order of its lines on the unturned page. A page with no text gives `count` 0 and four empty arrays. Reading text does not change what a later `save` writes. It first fetches the fallback fonts the page needs, as `renderPage` does, so the characters' boxes come from the font the page is drawn with; a font that cannot be fetched leaves the text read with what there is. `pageText(index, { signal })` takes a signal: an abort while the read waits in the queue or for a fallback font rejects with `aborted`, as a cancelled render does.
- The result has one entry per character in each of four arrays, so the arrays all have length `count`, and `geometry` has `count * TEXT_GEOMETRY_STRIDE` numbers. `codes` holds Unicode code points. `flags` holds bits: 1 for a character the engine inferred (a space or line break the page does not draw), 2 for a hyphen, 4 for a character with no Unicode mapping, whose code is 0. `fonts` holds an index into `fontTable`. A character the engine inferred takes the font and size of the character before it, or of the first one after it when none comes before. A character in a Type 3 font with no Unicode mapping takes the code point its glyph's name gives or, when the name gives none, its character code; a result below 32, a surrogate or one past U+10FFFF keeps code 0 and flag 4.
- A page is read up to 1,000,000 characters. `truncated` is true when it had more and the arrays hold the first 1,000,000. The cut can fall inside a line break the engine inferred, so the last character can be a lone CR.
- `geometry` holds 15 numbers per character, `TEXT_GEOMETRY_STRIDE` of them: the character box (left, bottom, right, top), the loose box (left, bottom, right, top), the origin (x, y), the font size, and the text matrix (a, b, c, d).
- Each `fontTable` entry has the font's base name without a subset prefix, and `fixedPitch`, `serif`, `italic`, `bold` and `vertical` flags. `ascent` and `descent` are the figures of the face the engine loaded for the font, in em units: Helvetica gives 0.945 and -0.224. They are `null` for a Type 3 font and when both are 0. `descriptorAscent` and `descriptorDescent` are the font descriptor's `/Ascent` and `/Descent` over 1000, with the sign the file gives them, and `null` when the file has no number there; a Type 0 font's come from its descendant font. `standard` names the standard 14 font the engine draws the font with, when it is one with no embedded file, and is `null` otherwise. The engine checks none of these figures: a file can give any value, a positive descent included.
- The arrays belong to you: they are copies, not views of engine memory.

```ts
const text = await doc.pageText(0)
const stride = TEXT_GEOMETRY_STRIDE
for (let i = 0; i < text.count; i++) {
  const left = text.geometry[i * stride] // box left
  const bottom = text.geometry[i * stride + 1] // box bottom
  console.log(String.fromCodePoint(text.codes[i]), left, bottom)
}
```

Reading links, the outline and named destinations:

- `pageLinks(index)` gives `{ annotations, links }` for a page. `annotations` has one entry for every annotation dictionary on the page, with its `index` in the page's annotation array, `subtype`, `flags`, `objectNumber` and `generation` (both absent for a direct object), `hasQuads` (whether `/QuadPoints` is there at all) and whether its `/Rect` and `/QuadPoints` are well formed. `links` has the Link annotations, each with the same `index`, a `rect` in user space before /Rotate (all zero when the file's `/Rect` is malformed) and `quads` when the file has them. `destinationInvalid` is true when the link has a `/Dest` that is not a string, a name or an array, and the link then has no `destination`.
- `outline()` gives `{ items, truncated }`. Each item has its `title`, `bold`, `italic`, the file's `count` and its `children`. `truncated` is true when the outline loops, nests past 64 levels or has more than 100,000 items.
- `namedDestination(name)` takes the name's bytes and gives the destination the file's name tree or catalog holds for it, or `undefined` when the file has no such name.
- A link or an outline item can carry a `destination`, an `action` and an `additionalAction`. A destination is `{ page, fit, args }`, with `page` counting from 0 and -1 when it names no page of the file (in a `GoToR` or `Launch` action it is the number the file gives, since the page is in another file), and `args` always four entries, `null` where the file has none, or `{ name }` holding a named destination's bytes. An action has a `kind` (the file's `/S`) and, as the file has them, `uri`, `destination`, `file`, `newWindow`, `name` or `script`. Strings from the file are `Uint8Array`s.
- A `{ page, fit, args }` destination also gives the shape of its array as the file wrote it, for a caller that checks it by its own rules: `pageRef`, the object number and generation of the object its first entry refers to, as the file holds that object and not as the entry writes the generation (absent when that entry is not a reference); `argCount`, the number of entries after the fit; `argKinds`, `'number'`, `'null'` or `'other'` for each of the first 8 of them; `argIndirect`, whether any of those 8 is written as a reference; `fitKind`, `'name'`, `'string'`, `'other'` or `'missing'`; and `pageKind`, `'ref'` for a reference to a dictionary, `'integer'` for a whole number, `'other'` or `'missing'`. The engine does not check them.
- A URI action's `uriKind` says whether `/URI` was a string or a name, and is absent, with `uri` empty, when it was neither. A remote go-to's or a launch's `fileKind` says whether `/F` was a string or a file specification, and is absent when it was neither.
- The engine reports the file's facts and applies no URL rules: it does not decode, complete or filter a URI. A JavaScript action's source comes back as text in `script`, and the engine never runs it. A script is cut to 4,096 bytes, counted as UTF-8 with JSON escapes, and the scripts of one page's links get 1,048,576 such bytes between them; once those are spent each later script is empty. `scriptTruncated` is true on an action whose script was cut.

```ts
const { links } = await doc.pageLinks(0)
for (const link of links) {
  if (link.action?.kind === 'URI' && link.action.uri)
    console.log(new TextDecoder().decode(link.action.uri), link.rect)
}
const { items } = await doc.outline()
const target = await doc.namedDestination(new TextEncoder().encode('chapter-2'))
```

File facts, annotations and the form:

- Each of these calls reports what the file holds and applies no rule of its own. You decide which annotations to list, what a flag means and what to do with a colour of five components. None of them changes what `save` writes.
- A text string from the file comes back as a string when its bytes are PDFDocEncoding, or UTF-16 or UTF-8 with a byte order mark. Other bytes come back as `{ bytes }`, a `Uint8Array`, for you to decode or skip. A name comes back as a string with one character per byte, U+0000 to U+00FF. A number the file writes as something other than a finite number comes back as `null`. PDFium keeps a real as a 32-bit float, so you get the shortest decimal that reads back as that float: `/CA 0.4` gives 0.4.
- A string is cut after 1,048,576 bytes of UTF-8 (524,288 bytes for `{ bytes }`), and its entry then has `truncated: true`.

`documentFacts()` gives `{ title, author, encrypted, openedAs }`. `title` and `author` come from `/Info` when they are strings. `encrypted` says whether the trailer has `/Encrypt`. `openedAs` is `'none'` for a file with no encryption, `'owner'` when the owner password opened it (an empty one included) and `'user'` otherwise. The engine lifts a file's permission flags so it can write to it; `openedAs` reports the password, read before that.

`pageAnnotations(index)` gives `{ tabs, annotations, truncated }` for a page. `annotations` holds one entry for each dictionary in the page's `/Annots`, in order: hidden annotations, popups and widgets included. Each entry has its `index` in `/Annots`, `subtype`, `objectNumber` and `generation` (both absent for a direct object), `rect` as written with `rectOk` true only for four finite numbers, `flags`, and its appearance: `hasAppearance`, `appearance` (`'stream'` or `'states'`), `appearanceStates` and `appearanceState` (`/AS`). `appearanceStates` lists the state names in byte order, as PDFium's parser keeps no record of the file's order. The rest are present when the file has them in the right type: `quads`, `color`, `interiorColor`, `opacity`, `contents`, `author`, `created`, `modified`, `icon`, `inReplyTo`, `intent`, `line`, `lineEndings`, `vertices`, `inkLists`, `borderStyle`, `border`, `defaultAppearance`, `alignment`, `paperMetadata` and `parent`. Lists of numbers keep every entry the file writes, so a colour may have 5 components. `borderStyle.dash` holds `/BS /D` and `borderDash` holds the fourth entry of `/Border`, each as written: an empty, negative or all-zero dash comes back as it is, and a dash that is no list comes back as `null`. You decide whether a dash is valid. `inReplyTo` may name the annotation itself. `/QuadPoints`, `/Vertices` and `/InkList` give up to 1,000,000 numbers in all. A page index outside the document is a `RangeError`. The call reads `/Annots` without loading the page, so it loads no font. `truncated` is true past 200,000 annotations or 16 MB of report.

`formFields()` gives the form: its `kind` (`'none'`, `'acroform'` or `'xfa'`), `needAppearances`, `defaultAppearance`, `alignment` and its `fields`. Each field has its full `name`, `kind`, inherited `flags`, `valueKind` and `value`, `defaultValueKind` and `defaultValue`, `selectedIndices`, `options`, `maxLength`, `topIndex`, `tooltip`, `origin` and `widgets`. A value list holds text, names as `{ name }` and `null` for any other entry. `valueNull` and `defaultValueNull` are true when `/V` or `/DV` is written as null, which a reader may treat apart from no value at all. `selectedIndices` is `/I`, inherited as `/V` is, with `null` for an entry that is no number; it can disagree with `value`. `selectedIndicesOwn` says whether the field's own dictionary holds that `/I`. `toggleOptions` is a checkbox's or radio's `/Opt`, inherited as `/V` is, with text, names as `{ name }` and `null` for any other entry. `origin` is `'recovered'` for a field that only a page's widget reaches, outside `/Fields`. A field with no name is left out. Each widget has the same `rect` and appearance facts as an annotation, its `page` and `index` in that page's `/Annots` (both -1 when no page holds it), and, as the file has them, `onState` and `exportValue` for a checkbox or radio, `borderColor`, `backgroundColor`, `rotation`, `caption`, `rotate` (its own `/Rotate`), `alignment`, `tooltip` and `defaultAppearance`. A widget whose dictionary is not its field's also gives its own `/Opt` as `toggleOptions` (a checkbox or radio) and its own `/I` as `selectedIndices` (a list or combo box), neither inherited. `scripts` holds the JavaScript sources by key (`K`, `F`, `V`, `C` and the rest, and `A` for the widget's own action) as text, and the engine never runs them. `action` describes the widget's own `/A`: its `kind`, a URI action's `uri` bytes, a Named action's `name`, or a ResetForm action's `reset`. For a Launch or GoToR action, `fileKind` says whether `/F` is a `'string'`, a `'spec'` (a file specification) or `'other'`; `file` holds the string's bytes, and `specFile` and `specUnicodeFile` hold the specification's `/F` and `/UF` bytes. The engine builds no address from them.

- `groups` lists every dictionary of the field tree that has a `/Kids` list: parents of fields, a field's own dictionary above its widgets, and dictionaries the form leaves out or merges into a field of the same full name. Each has its `name`, `objectNumber` and `generation`, `field` (the index in `fields` when it is that field's own dictionary), `subtype`, its `kids`, its own `/MK` facts (`borderColor`, `backgroundColor`, `rotation`, `caption`), `rotate`, `page` (from `/P`, -1 when that is no page) and `scripts`, read as a widget's are.
- `fieldsRoot` is `/AcroForm /Fields` in the file's order. It and each group's `kids` list entries as written: `ref` (`null` for a direct entry), `dictionary`, and for a dictionary `hasKids`, `partialName` (its own `/T`: text, or `null` when it is no string; absent without `/T`) and `otherParent` (true when its `/Parent` is not the dictionary whose `/Kids` lists it). So you can walk the tree yourself and name each dictionary by your own rule.
- `walkIndex` gives each group and each field reached from `/Fields` its place in a depth-first walk, a dictionary before its `/Kids`, each list in the file's order and each dictionary once. Fields also carry `partialName` and `otherParent`, as groups do.
- `calculationOrder` has one entry for each entry of `/CO`: the index in `fields` of the field it names, or -1. `calculationOrderRefs` gives the same entries as `{ objectNumber, generation }`, `null` where the entry is no reference.
- `fieldTreeDepth` is the deepest level of `/Kids`, and `fieldTreeRevisits` is true when the tree reaches a dictionary twice, through a loop or a shared kid. The engine reads each dictionary once and stops 1,000 levels down.
- `tooLarge` is true for a form of more than 50,000 fields. The engine refuses it whole: `fields` is empty, and `/CO` is still read. Loading such a form takes PDFium tens of seconds.
- `truncated` is true when a cap cut the report short: 50,000 fields, 1,000 levels of tree, the report's share of 16 MB, or the work it may spend reading scripts. A field or widget cut by a cap has `truncated: true` and ends the list.

`scripts()` gives the file's JavaScript outside its fields, as source text the engine never runs. `document` lists each source of the `/Names /JavaScript` tree with its `name` (`null` when the tree's key is no string). `documentActions` holds the catalog's open action under `OpenAction` and its `/AA` by key. `pageActions` lists each page whose `/AA` holds JavaScript, with its sources by key (`O`, `C`). A file with none gives empty lists. To know whether a file has any JavaScript at all, check its fields' `scripts` in `formFields()` too. `truncated` is true when a cap cut the report: 4 MB for one source, 50,000 names, 1,000 levels of name tree or 16 MB in all.

`structureOrder(index)` gives `{ order, truncated }`: the object numbers of a page's annotations in the order the structure tree reaches them, each once. Annotations the tree does not reach are missing, and a file with no structure tree gives an empty list. `truncated` is true past 1,000 levels or 1,000,000 objects.

```ts
const facts = await doc.documentFacts()
const { annotations } = await doc.pageAnnotations(0)
const notes = annotations.filter((a) => a.subtype === 'Text')
const form = await doc.formFields()
if (form.tooLarge) console.log('The form has more than 50,000 fields.')
for (const field of form.fields) console.log(field.name, field.kind, field.value)
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
- `destroy()` rejects queued calls with `aborted`, stops a running render, and a `pageText`, `write` or `redact` waiting on a fallback font, each of which rejects with `aborted`, and closes every document. In a worker it waits up to two seconds for any other running call, then stops the worker; a call still running then rejects with `aborted`. In the calling thread it waits for any other running call to finish. A `close()` after `destroy()` resolves.
- A `signal` cancels a call while it waits in the queue. On `renderPage` it also stops a render that has started. The engine draws in steps of about 8 ms and checks the signal between them, so the render rejects with `aborted` a few milliseconds after you abort, and you get no pixels. Some pages take longer steps. A page of many plain paths, or a large image, can take tens of milliseconds to stop at a viewer's zooms, and longer at very high scales. A render that finishes before the engine sees the abort still resolves. An abort while the render waits for a fallback font also rejects with `aborted`; the font is fetched again next time. Other calls that have started run to the end and may still reject.

Errors:

- Engine calls reject with an `EngineError`. Its `code` is `password-required`, `password-incorrect`, `invalid-pdf`, `unsupported-security`, `out-of-memory`, `write-failed`, `redaction-failed`, `check-failed`, `aborted` or `engine-failure`.
- `write-failed` means part of a `write` could not be written. The message names the annotation or the field, and for an annotation the error's `annotation` holds its id. The document is left as it was opened and the engine keeps working.
- `redaction-failed` means `redact` refused a mark before changing anything (its `reason` says why; see [Redacting](#redacting)), or could not remove an annotation, load a page, write a mark, apply the marks of a page, read the file's report, or sanitise the file. The error's `page` holds the page index, and `annotation` holds the mark's id when writing one mark failed. Marks on a page are applied together, so a failure while applying names the page only. The document is left as it was opened and the engine keeps working.
- `check-failed` means `checkRedaction` could not inspect a page or the file. The error's `page` holds the page index when a page was the cause. Treat it as a failed check. The engine keeps working.
- A `RangeError` means a `write` after a `redact`, an incremental save after a `redact`, a page index outside the document, a scale that is not a finite number above 0, `scale` and `size` together, a size that is not two whole numbers from 1, a region whose width or height is not a finite number above 0, a rotation other than 0, 90, 180 or 270, a `hide` entry that is neither a whole number from 1 nor `{ index }` with a whole number from 0, an entry of `renderAnnotations` whose index is not a whole number from 0 or whose state is empty or holds a character past U+00FF or a NUL, a `renderAnnotations` call with no region or size, a render larger than 268,435,456 pixels, a resource name in an appearance outside A-Z, a-z and 0-9, an appearance whose bounds have no width or no height, or a field value that is not a string or a list of strings. For `checkRedaction` it means a region on a page the file does not have, a region with no quads, or a quad with a number that is not finite as a 32-bit float.
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

To pin a newer release of the fork, run `pnpm run pin v<chromium branch>.<n>` in this package. It reads the release from GitHub and rewrites `pdfium.lock.json` with its version, URL and SHA-256; set `GITHUB_TOKEN` if you hit the API rate limit.

## Licence

[MIT](https://github.com/inkbar/inkbar/blob/main/LICENSE). The WebAssembly binary is PDFium and the libraries linked into it, such as FreeType, libjpeg-turbo, OpenJPEG and zlib, each under its own licence. `dist/THIRD-PARTY-NOTICES` in the package carries all of them. From the team behind [Redactr](https://redactr.io).
