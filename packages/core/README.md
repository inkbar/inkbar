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

`@inkbar/core` opens PDFs, renders pages with PDF.js and keeps annotations as typed data. The Vue, React and Svelte packages build on it. You can also use it on its own: `createViewer` puts a complete viewer, with note threads, redaction review and controls to build your toolbars from, into any element in a plain TypeScript app.

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

`createViewer` opens a document and renders it into an element, with a note thread and a suggested-redaction card. The toolbars are yours: build them from the controls below, which use the same markup as the framework packages, so `@inkbar/theme` styles them.

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
  createToolButton(viewer, 'view'),
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

It takes the [`mountViewer` options](#mounting-a-viewer) except `container` and `document`, plus `source` and `assets` (both required), `password`, `defaults`, `history`, `onReady` and `onError`. Set `notes` or `suggestions` to `false` to leave that part out. `viewer.status`, `viewer.document`, `viewer.engine`, `viewer.viewport` and `viewer.tools` are readables; the last two change when the engine rebuilds. A password you pass to `open` replaces the `createViewer` one for that load. The controls are `createToolButton`, `createUndo`, `createRedo`, `createZoomIn`, `createZoomOut`, `createZoomSelect`, `createPageInput`, `createPageCount`, `createPrevPage` and `createNextPage`. Each one disables itself while no document is ready and lives as long as its viewer. Buttons show an icon from [`@inkbar/icons`](https://github.com/inkbar/inkbar/tree/main/packages/icons). Replace their children with your own icon and the accessible name stays; `createIcon` draws any `@inkbar/icons` icon for your own buttons. `createToolbar` gives one Tab stop to all its buttons, with arrow keys between them, and `createToolbarSeparator` divides groups of controls in it. An input, select or textarea you add keeps its arrow keys and its own `tabindex`: it is a Tab stop unless you give it `tabindex="-1"`.

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

## Tools and keyboard

`createToolController` from `@inkbar/core/dom` routes pointer and key events on the viewport to the active tool: `view`, `select`, `highlight`, `redact-area` or `note`. Highlights, text redactions and notes can be made from the keyboard. Drawing an area redaction needs a pointer.

| Where focus is               | Key                                 | Effect                                                                                              |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Viewport, `highlight` tool   | `Enter`                             | Turns the text selection into a highlight                                                           |
| Viewport, `redact-area` tool | `Enter`                             | Turns the text selection into text redactions                                                       |
| Viewport, `note` tool        | `Enter`                             | Places a note at the centre of the current page and focuses it                                      |
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

`redact-area` draws an area mark when you drag. To redact text instead, select the text with the `view` tool, switch to `redact-area`, then click inside the selection or press `Enter`. The tool keeps the press from starting a new text selection, so it cannot select text itself.

With the `select` tool, a selected area redaction, text box or shape shows four corner handles (`.ink-handle[data-handle="nw|ne|sw|se"]`). Dragging one resizes it; the store records a single update on release. Drag the annotation itself to move it.

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
