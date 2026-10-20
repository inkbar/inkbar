<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-dark.svg">
    <img src="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-light.svg" alt="Inkbar" width="72" height="72">
  </picture>
</p>

<h1 align="center">@inkbar/core</h1>

<p align="center">
  The engine under Inkbar: documents, rendering, annotations and tools, with no framework dependency.
</p>

<p align="center">
  <a href="https://inkbar.dev">Website</a> ·
  <a href="https://inkbar.dev/docs/">Docs</a> ·
  <a href="https://sandbox.inkbar.dev">Sandbox</a> ·
  <a href="https://github.com/inkbar/inkbar">GitHub</a>
</p>

---

`@inkbar/core` opens PDFs, renders pages with PDF.js and keeps annotations as typed data. The Vue, React and Svelte packages build on it. You can also use it on its own: `createViewer` puts a complete viewer, with comment threads, redaction review and controls to build your toolbars from, into any element in a plain TypeScript app.

Every coordinate is stored in PDF user space (points, origin bottom-left, before `/Rotate`), so annotations stay put whatever the zoom, rotation or screen.

- `@inkbar/core` holds the document model and annotation store. It is safe to import during server rendering.
- `@inkbar/core/dom` renders pages, text layers and annotation layers into the DOM.
- `@inkbar/core/vite` is a Vite plugin that serves the PDF.js assets.

## Install

```sh
pnpm add @inkbar/core
```

## Usage

```ts
import { openDocument } from '@inkbar/core'
import { assets } from 'virtual:inkbar-assets' // from the Vite plugin, see below

const doc = await openDocument(file, { assets })
await doc.ready

doc.annotations.add({ type: 'highlight', page: 0, quads })
const json = doc.exportAnnotations('json')
```

`file` can be a `File`, `Blob`, `Uint8Array`, a URL string, `{ url, key }` when the URL is signed and changes between loads, or `{ data, key }` for bytes you want to identify. `quads` is a list of quads in PDF user space.

Writing annotations back into the PDF needs `@inkbar/engine`, which is not released yet. Until then `save()` rejects with `EngineUnavailable`. Persist `exportAnnotations('json')` instead and re-import it on the next open. `doc.key` stays the same between opens only when you open with a key: a URL string, `{ url, key }` or `{ data, key }`. A `File`, `Blob` or raw bytes get a new random key each time.

The DOM layer (`@inkbar/core/dom`) provides the viewport, canvas renderer, text layer, overlay and tools for hosts without a framework package. Vue hosts should use [`@inkbar/vue`](https://github.com/inkbar/inkbar/tree/main/packages/vue), React hosts [`@inkbar/react`](https://github.com/inkbar/inkbar/tree/main/packages/react), Svelte hosts [`@inkbar/svelte`](https://github.com/inkbar/inkbar/tree/main/packages/svelte).

### Without a framework

`createViewer` opens a document and renders it into an element, with a comment thread popover for notes and highlights and a suggested-redaction card. The toolbars are yours: build them from the controls below, which use the same markup as the framework packages, so `@inkbar/theme` styles them.

```ts
import {
  createViewer,
  createToolbar,
  createToolButton,
  createPageInput,
  createPageCount,
  createZoomOut,
  createZoomSelect,
  createZoomIn,
} from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'

const viewer = createViewer(el, { source: file, assets, zoom: 'fit-width' })

const tools = createToolbar()
tools.append(
  createToolButton(viewer, 'select-text'),
  createToolButton(viewer, 'select'),
  createToolButton(viewer, 'highlight')
)

const undo = document.createElement('button')
undo.textContent = 'Undo'
undo.onclick = () => viewer.document.get()?.history.undo()
tools.append(undo) // buttons join the toolbar's arrow-key order

const pages = createToolbar({ label: 'Page and zoom' })
pages.append(
  createPageInput(viewer),
  createPageCount(viewer),
  createZoomOut(viewer),
  createZoomSelect(viewer),
  createZoomIn(viewer)
)

viewer.element.prepend(tools) // above the document
viewer.element.append(pages) // below it

viewer.open(otherFile) // destroys the current document; the latest call wins
viewer.open(lockedFile, { password }) // this password applies to this load only
viewer.destroy()
```

It takes the [`mountViewer` options](#mounting-a-viewer) except `container` and `document`, plus `source` and `assets` (both required), `password`, `defaults`, `history`, `onReady` and `onError`. Set `threads` or `suggestions` to `false` to leave that part out. `viewer.status`, `viewer.document`, `viewer.engine`, `viewer.viewport` and `viewer.tools` are readables; the last two change when the engine rebuilds. A password you pass to `open` replaces the `createViewer` one for that load. The controls are `createToolButton`, `createUndo`, `createRedo`, `createZoomIn`, `createZoomOut`, `createZoomSelect`, `createPageInput`, `createPageCount`, `createPrevPage` and `createNextPage`. Each one disables itself while no document is ready and lives as long as its viewer. Buttons show an icon from [`@inkbar/icons`](https://github.com/inkbar/inkbar/tree/main/packages/icons). Replace their children with your own icon and the accessible name stays; `createIcon` draws any `@inkbar/icons` icon for your own buttons. `createToolbar` gives one Tab stop to all its buttons, with arrow keys between them, and `createToolbarSeparator` divides groups of controls in it. An input, select or textarea you add keeps its arrow keys and its own `tabindex`: it is a Tab stop unless you give it `tabindex="-1"`.

`createViewer` reads the theme's colours from the element you pass, so that element needs to be in the page when you call it.

### Mounting a viewer

`mountViewer` wires the viewport, page layers, tools and zoom and page keys onto a scroll container. You render the chrome around it.

```ts
import { mountViewer } from '@inkbar/core/dom'

const engine = mountViewer({
  container, // a focusable, scrollable element
  document: doc,
  zoom: 'fit-width',
  onPageError: (page, error) => console.warn(page, error),
})
engine.tools.set('highlight')
engine.rebuild({ gap: 32 }) // construction-only options; zoom, page, tool and scroll position carry over
engine.destroy()
```

Options:

- `container` and `document`, both required.
- `zoom` (a number, `'fit-width'` or `'fit-page'`; default `'fit-width'`), `page`, `mode`, `rotation` and `tool` set the starting view. Change them later through `engine.viewport` and `engine.tools`.
- `gap`, `buffer` and `customAnnotations` are fixed for a build. Change them with `engine.rebuild`.
- `toolOptions` holds the tools' options, such as the shape kind. Pass one from `createToolOptions()` and keep it to carry the options over to the next document; `createViewer` keeps one for its whole life. The tool style (colours, line style, text style) belongs to the document: each new document starts from the theme's defaults.
- `signatures` is where saved signatures live (see [Signatures](#signatures)); `signatureFonts` lists the handwriting fonts a typed signature offers.
- `onActivate(id)` fires when the user activates an annotation.
- `onBuild(viewport, tools)` fires after every build, the first one included, before `mountViewer` returns. Subscribe to the new viewport and tool controller here.
- `onPageMount(page, mount, host)` and `onPageUnmount(page)` fire as pages enter and leave the mounted range.
- `onPageError(page, error)` reports a page whose canvas or text layer failed, and `onPageError(page, null)` once every failed layer renders again. Unmounting a failed page emits no `null`, so clear any per-page error in `onPageUnmount`.

The viewport mounts pages synchronously, so a build's page callbacks fire before its `onBuild`. During a rebuild, `engine.viewport` and `engine.tools` still point at the destroyed objects while those callbacks run. Read the arguments instead, or wait for `onBuild`.

## Annotation changes

`doc.annotations.on('change', fn)`, and `onChange(next, change)` in controlled mode, describe each mutation:

- `{ kind: 'add', annotation }`
- `{ kind: 'update', id, before, after }`
- `{ kind: 'remove', annotation, removed }`. Removing a note also removes its replies, so `removed` lists everything that went: `annotation` first, then the replies. A host that syncs by change should delete every id in `removed`.
- `{ kind: 'replace', reason }` for an import, a history step or a controlled sync. Read the whole list.

`add` throws if `input.id` is already in the list. Locked annotations refuse changes to their geometry, `page` and `contents`.

`doc.history.batch(fn)` records everything `fn` changes as one undo step, so a host that adds many annotations at once can undo them together. Change events still fire once per annotation. `fn` must be synchronous, and nested calls join the outer batch. In controlled mode `doc.history` records nothing; the framework packages' `useHistory().batch` works in both modes.

## PDF names in annotations

Values taken from PDF names use PDF's spelling: `OpenArrow` and `ROpenArrow` for line endings, `Comment` and `NewParagraph` for note icons, `FreeTextCallout` and `LineArrow` for intents. Other valid PDF names (no spaces, none of `( ) < > [ ] { } / %`) are kept and written back unchanged, so `icon: 'Check'` survives an import and export. `LINE_ENDINGS`, `NOTE_ICONS` and `INTENTS` list the names Inkbar knows, and `isKnown(list, name)` tests one. A line ending Inkbar does not know draws as `None`, and every note icon draws the same icon.

## Callouts and speech bubbles

A free-text callout is stored as PDF and XFDF store it: `intent: 'FreeTextCallout'`, a `rect` that holds the text box and the leader line together, a `fringe` (`{ left, top, right, bottom }`, PDF `/RD`) that insets `rect` to the text box, and a `callout` of two or three points running from the tip, through an optional bend, to where the line meets the box. `head` is the ending at the tip.

A speech bubble is a standard callout plus Inkbar's `cornerRadius`. Inkbar draws it as one rounded outline with a wedge to the tip. Other viewers ignore `cornerRadius` and draw a box with a leader line.

A callout's corner handles resize its text box: the tip and bend stay, and the point on the box moves with the edge it sits on. Its tip handle moves the tip alone. Each edit refits `rect` and `fringe` in the same update, so it is one undo step.

## Limits of PDF import

Inkbar reads the annotations embedded in a PDF through PDF.js, which passes on only part of each one. Import keeps `intent` (`/IT`) for every type. Once the document is ready, Inkbar reads from the file itself the fields PDF.js leaves out: a FreeText's `callout`, `fringe`, `head` and font, and a note's icon. They arrive as one `replace` change with `reason: 'embedded'`. That change adds no undo step and keeps the undo history.

Inkbar does not read callout, icon or font fields from encrypted PDFs, from annotations stored as direct objects, or from a file with a broken cross-reference table.

One gap remains:

- Keep line endings Inkbar does not know on lines and polylines. PDF.js turns them into `None`. Annotations loaded from JSON keep them.

## Tools and keyboard

`createToolController` from `@inkbar/core/dom` routes pointer and key events on the viewport to the active tool: `select-text`, `select`, `highlight`, `redact-area`, `sketch`, `draw`, `shape`, `freetext`, `signature` or `note`. Highlights, text redactions, notes and signatures can be made from the keyboard. Area redactions, sketches and drawings need a pointer.

| Where focus is               | Key                                 | Effect                                                                                              |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Viewport, `highlight` tool   | `Enter`                             | Turns the text selection into a highlight                                                           |
| Viewport, `redact-area` tool | `Enter`                             | Turns the text selection into text redactions                                                       |
| Viewport, `note` tool        | `Enter`                             | Places a note at the centre of the current page and focuses it                                      |
| Viewport, `signature` tool   | `Enter`                             | Places the chosen signature at the centre of the current page                                       |
| Viewport                     | `+` or `=`, `-`                     | Zoom in, zoom out                                                                                   |
| Viewport                     | `Home`, `End`, `PageUp`, `PageDown` | First, last, previous, next page                                                                    |
| Annotation                   | `Enter` or `Space`                  | Selects and activates it                                                                            |
| Annotation                   | `ArrowUp`, `ArrowDown`              | Previous or next annotation on the page, in reading order                                           |
| Annotation                   | `Shift` + arrow                     | Moves it 1 pt (`Shift` + `Alt` + arrow: 10 pt)                                                      |
| Annotation                   | `Ctrl` or `Cmd` + `Shift` + arrow   | Resizes an area redaction, text box or shape by 1 pt. Right and Down grow it, Left and Up shrink it |
| Annotation                   | `Delete` or `Backspace`             | Removes it                                                                                          |
| Annotation                   | `Escape`                            | Clears the selection                                                                                |

The tool controller and the overlay handle the tool and annotation keys. The zoom and page keys (`+`, `=`, `-`, `Home`, `End`, `PageUp`, `PageDown`) come from `attachViewportKeys`, which the tool controller does not install. Attach it to the same container:

```ts
import { attachViewportKeys } from '@inkbar/core/dom'

const detach = attachViewportKeys(container, {
  viewport,
  pageCount: () => doc.pages.length,
})
// later: detach()
```

On a focused annotation, `Enter` or `Space` selects it and calls `onActivate`; what activation opens is up to the host.

Locked annotations, such as those embedded in the file, ignore move, resize and delete. Without a text selection, `Enter` in the `highlight` and `redact-area` tools does nothing.

`redact-area` draws an area mark when you drag, even from a highlight. To redact text instead, select the text with the `select-text` tool, switch to `redact-area`, then click inside the selection or press `Enter`. The tool keeps the press from starting a new text selection, so it cannot select text itself.

`sketch` draws freehand ink, one annotation per stroke. A stroke that looks like a line, an arrow, a rectangle, an ellipse, a polygon or a star becomes that shape, in the shape style. A click, or a stroke under 4 CSS px across, stays ink. One undo turns the shape back into the stroke, and a second removes the stroke. Draw each shape in one stroke: for an arrow, draw the shaft, then the head, without lifting. The recogniser is exported from `@inkbar/core` for your own input: `recogniseStroke(points)` takes user-space points and returns the shape with a score from 0 to 1, or `undefined` when the points fit no shape. A stroke counts as a shape at `RECOGNISE_THRESHOLD` (0.8) or above.

The `shape` tool's `loupe` kind adds a loupe: a circle that shows the page under its centre at `magnification` times the size (2 by default), with a rim in the shape style's border colour and width. A drag sizes it, always as a circle, and a click places one 72 pt across. It needs a pointer: `Enter` places no loupe. It magnifies the page itself, not the annotations under it, and redraws a moment after it moves, resizes or the zoom changes. Pass the overlay a `document` (page mounts and the viewer do) or a loupe shows only its rim.

The `shape` tool's `mask` and `ovalMask` kinds add a mask: the page is dimmed everywhere outside a rectangle or an ellipse (`shape: 'rect' | 'ellipse'`), by `dim` (0 to 1, 0.5 by default) in black. A drag sizes it, with `Shift` for a square or circle, and a click places one 72 pt across. Like the loupe it needs a pointer: `Enter` places no mask. A page has one mask: adding a second replaces the first in the same undo step, and in a controlled store in the same `onChange`. The dimming is an SVG (`svg[data-ink-mask-layer]`) between the page and the annotation overlay that never takes the pointer; the mask annotation's own element is the shape, and only a thin band along its edge takes presses. Inside the shape the page works as usual: select text, highlight it, add shapes or notes. The style controls have nothing to change on a mask.

With either select tool (`select-text` or `select`), a selected area redaction, text box, shape, loupe, mask, polyline, polygon or drawing shows four corner handles (`.ink-handle[data-handle="nw|ne|sw|se"]`), and a selected line shows one on each end (`data-handle="start|end"`). Dragging a corner resizes the annotation, scaling its points with it; `Shift` keeps its aspect ratio. Dragging a line end moves that end only. The store records a single update on release. Drag the annotation itself to move it, or any member of a multi-selection to move them all in one undo step. Text markup in the selection stays on its text unless it is the one you drag.

A press on text markup (a highlight, underline, strikeout or squiggly) does nothing at first. A click selects it; a drag selects the text under it, as a drag on the bare text would. Presses on every other annotation select it straight away.

## Signatures

A signature here is a mark on the page, not a cryptographic signature of the file. Draw one, type your name in a handwriting font, or upload a scan, and it is saved as a template. The `signature` tool places the chosen template: a click puts it about 150 pt wide, centred on the press, and `Enter` puts it at the centre of the current page. It is turned against the page's `/Rotate`, so it reads upright on the page; a view rotation turns it with the page. A drawn signature becomes `ink` and the others a `stamp` (an image), both with `subject: 'Signature'`. Both keep their aspect ratio when resized.

Your app owns the templates. Pass a `SignatureStore` (`list`, `save`, `remove`, each returning a promise) as `signatures`. `createMemorySignatureStore()` is the default, and forgets everything on reload. `createLocalSignatureStore(key)` keeps them in `localStorage` and falls back to memory where storage is blocked. When storage is full, `save` rejects and the dialog says the signature was not saved. An uploaded image is scaled to at most 1000 px on its long side before it is stored. Typed signatures use the fonts in `signatureFonts`. Load each one with `@font-face` before offering it.

`createSignatureMenu(viewer)` lists the saved signatures, removes them, and opens `createSignatureDialog`, which draws, types or uploads a new one and selects it.

## Serving PDF.js assets

PDF.js needs a worker script plus directories of CMaps, standard fonts, wasm decoders and ICC profiles. Inkbar loads them from URLs you pass as the `assets` option. The option has no default, because the right URLs depend on how you deploy your app.

### With Vite

Add the plugin:

```ts
// vite.config.ts
import { inkbar } from '@inkbar/core/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [inkbar()],
})
```

Then import the URLs from the virtual module:

```ts
import { assets } from 'virtual:inkbar-assets'
```

In development the plugin serves the files from `node_modules`. In a build it copies them into `<outDir>/inkbar/`. The URLs respect your `base`. With a relative `base` such as `./`, the plugin resolves the URLs at runtime from the location of your bundle, so the build works from any path. Pass `inkbar({ assetsDir: 'pdf' })` to use a different directory name.

For TypeScript, reference the module declaration once, for example in `env.d.ts`:

```ts
/// <reference types="@inkbar/core/vite/client" />
```

### Without Vite

Copy these from the installed `pdfjs-dist` package to a path your server exposes:

- `build/pdf.worker.min.mjs`
- `cmaps/`
- `standard_fonts/`
- `wasm/`
- `iccs/` (optional)

Pass their URLs. Directory URLs end in `/`:

```ts
const assets = {
  worker: '/pdfjs/pdf.worker.min.mjs',
  cMaps: '/pdfjs/cmaps/',
  standardFonts: '/pdfjs/standard_fonts/',
  wasm: '/pdfjs/wasm/',
  icc: '/pdfjs/iccs/',
}
```

Use the `pdfjs-dist` version that `@inkbar/core` depends on, so the worker matches the library.

## Licence

[MIT](https://github.com/inkbar/inkbar/blob/main/LICENSE). From the team behind [Redactr](https://redactr.io).
