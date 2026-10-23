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

`exportAnnotations('json')` returns a [Gloss](https://gloss-format.org) document, an open JSON format for PDF annotations, and `importAnnotations` reads one. Gloss has no loupe, mask, pen pressure or free-text border colour, so Inkbar writes them under `custom.inkbar`. It writes a loupe as a circle and a mask as a circle or square, so other Gloss readers can still draw them. Inkbar leaves your own keys under `custom` as they are. In the store and the API, loupes, masks, `pressure` and `borderColor` keep their plain names.

Writing annotations back into the PDF needs `@inkbar/engine`, which is not released yet. Until then `save()` rejects with `EngineUnavailable`. Persist `exportAnnotations('json')` instead and re-import it on the next open. `doc.key` stays the same between opens only when you open with a key: a URL string, `{ url, key }` or `{ data, key }`. A `File`, `Blob` or raw bytes get a new random key each time.

The DOM layer (`@inkbar/core/dom`) provides the viewport, canvas renderer, text layer, overlay and tools for hosts without a framework package. Vue hosts should use [`@inkbar/vue`](https://github.com/inkbar/inkbar/tree/main/packages/vue), React hosts [`@inkbar/react`](https://github.com/inkbar/inkbar/tree/main/packages/react), Svelte hosts [`@inkbar/svelte`](https://github.com/inkbar/inkbar/tree/main/packages/svelte).

### Without a framework

`createViewer` opens a document and renders it into an element, with a comment thread popover for notes and highlights. The toolbars are yours: build them from the controls below, which use the same markup as the framework packages, so `@inkbar/theme` styles them.

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

It takes the [`mountViewer` options](#mounting-a-viewer) except `container` and `document`, plus `source` and `assets` (both required), `password`, `defaults`, `history`, `onReady` and `onError`. Set `threads` to `false` to leave out the thread popover. `viewer.status`, `viewer.document`, `viewer.engine`, `viewer.viewport` and `viewer.tools` are readables; the last two change when the engine rebuilds. `viewer.activated` is a readable too: the id of the annotation the user last clicked or activated with Enter, or `null`. `viewer.setActivated(id)` activates one from your code without calling `onActivate`; it ignores an id the document doesn't have, and `setActivated(null)` clears it. A password you pass to `open` replaces the `createViewer` one for that load. The controls are `createToolButton`, `createUndo`, `createRedo`, `createZoomIn`, `createZoomOut`, `createZoomSelect`, `createPageInput`, `createPageCount`, `createPrevPage`, `createNextPage` and `createCommandButton`. Each one disables itself while no document is ready and lives as long as its viewer. Buttons show an icon from [`@inkbar/icons`](https://github.com/inkbar/inkbar/tree/main/packages/icons). Replace their children with your own icon and the accessible name stays; `createIcon` draws any `@inkbar/icons` icon for your own buttons. `createToolbar` gives one Tab stop to all its buttons, with arrow keys between them, and `createToolbarSeparator` divides groups of controls in it. `createCommandButton(viewer, id)` places a plugin command: a `div.ink-command` holding a button named by the command's label (disabled with the command; while it runs, it keeps focus with `aria-busy` and `aria-disabled`, and a press does nothing) and a `span.ink-command-status[role="status"]` with its status text; for an id no plugin registered it logs an `InkError('UnknownCommand')` to the console, naming the id and the ones that are registered, and returns the same markup disabled and hidden (`aria-hidden`, no label). Pass `plugins: [...]` to `createViewer` to register plugins; their tools join the viewer's, and `createToolButton` takes a plugin tool's own label and icon. `viewer.commands.get(id)` returns a command. An input, select or textarea you add keeps its arrow keys and its own `tabindex`: it is a Tab stop unless you give it `tabindex="-1"`.

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
- `decorateAnnotation(annotation)` returns your own `data`, `classes` and `description` for an annotation's element, or `undefined`. `{ data: { 'my-flag': 'on' } }` writes `data-my-flag="on"`, and `description` becomes the element's `aria-description`. Inkbar re-applies them whenever the annotations change. Call `engine.redecorate()` when they depend on anything else. Core's own attributes and `ink-` classes always win.
- `onActivate(id)` fires when the user activates an annotation.
- `onBuild(viewport, tools)` fires after every build, the first one included, before `mountViewer` returns. Subscribe to the new viewport and tool controller here.
- `onPageMount(page, mount, host)` and `onPageUnmount(page)` fire as pages enter and leave the mounted range.
- `onPageError(page, error)` reports a page whose canvas or text layer failed, and `onPageError(page, null)` once every failed layer renders again. Unmounting a failed page emits no `null`, so clear any per-page error in `onPageUnmount`.

To open your own card next to an annotation, use `createPopover`: it anchors a panel to the annotation's element, follows it as pages mount and unmount, and calls your `onDismiss` on Escape or a press outside. `placePanel` positions a panel against any other rectangle.

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

Most creation tools are one-shot: `shape`, `freetext`, `note`, `redact-area` and `signature` each make one thing, select it, then hand back to `select-text`. After a one-shot tool has made something, a press on empty page or `Escape` clears the selection and switches to `select-text` without making anything more. The press that closes a new text box, or a new note's popover, counts as that press too. Until then, what it made keeps its edit handles: drag it to move it, drag a handle to resize it, and the tool stays on. A press on another annotation switches to `select-text` and selects it, and a drag moves it. Removing what the tool made (`Delete`, undo, or a controlled host refusing the add) leaves the tool on for another go, and the selection moving to something else switches to `select-text`. Picking a tool again starts it afresh. While the tool waits for that press, the viewport carries `data-ink-made`. `draw`, `sketch` and `highlight` are sticky: they stay on until you pick another tool.

A host tool says which it is with `kind: 'one-shot' | 'sticky'` (no `kind` is sticky). A one-shot tool adds and selects what it makes, then calls `ctx.made(ids)`; `ctx.done()` clears the selection and switches to `select-text` itself. Under a sticky tool, `ctx.made` does nothing. The controller's `active` readable reports every switch, including one a one-shot tool makes.

| Where focus is               | Key                                           | Effect                                                                                              |
| ---------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Viewport, `highlight` tool   | `Enter`                                       | Turns the text selection into a highlight                                                           |
| Viewport, `redact-area` tool | `Enter`                                       | Turns the text selection into text redactions                                                       |
| Viewport, `note` tool        | `Enter`                                       | Places a note at the centre of the current page and focuses it                                      |
| Viewport, `signature` tool   | `Enter`                                       | Places the chosen signature at the centre of the current page                                       |
| Viewport                     | `+` or `=`, `-`                               | Zoom in, zoom out                                                                                   |
| Viewport                     | `Home`, `End`, `PageUp`, `PageDown`           | First, last, previous, next page                                                                    |
| Viewer root, toolbars too    | `Ctrl` or `Cmd` + `Z`                         | Undo                                                                                                |
| Viewer root, toolbars too    | `Ctrl` or `Cmd` + `Shift` + `Z`, `Ctrl` + `Y` | Redo                                                                                                |
| Annotation                   | `Enter` or `Space`                            | Selects and activates it                                                                            |
| Annotation                   | `ArrowUp`, `ArrowDown`                        | Previous or next annotation on the page, in reading order                                           |
| Annotation                   | `Shift` + arrow                               | Moves it 1 pt (`Shift` + `Alt` + arrow: 10 pt)                                                      |
| Annotation                   | `Ctrl` or `Cmd` + `Shift` + arrow             | Resizes an area redaction, text box or shape by 1 pt. Right and Down grow it, Left and Up shrink it |
| Annotation                   | `Delete` or `Backspace`                       | Removes it                                                                                          |
| Annotation                   | `Escape`                                      | Clears the selection                                                                                |

The tool controller and the overlay handle the tool and annotation keys. The zoom and page keys (`+`, `=`, `-`, `Home`, `End`, `PageUp`, `PageDown`) come from `attachViewportKeys`, which the tool controller does not install. Attach it to the same container:

```ts
import { attachViewportKeys } from '@inkbar/core/dom'

const detach = attachViewportKeys(container, {
  viewport,
  pageCount: () => doc.pages.length,
})
// later: detach()
```

`createViewer` and each binding's `InkRoot` put the undo and redo keys on the root element, so they work from the toolbars inside it as well as from the viewport. A key does what the Undo or Redo button does, and acts only while that button is enabled. `Ctrl` and `Cmd` both work on every platform, and so does `Ctrl` + `Y`. In a text field or editable content the keys stay with the element, so a field keeps its own text undo. In a `<select>` they are left to the browser, which does nothing with them. With `mountViewer` or `createToolController`, attach them yourself:

```ts
import { attachHistoryKeys } from '@inkbar/core/dom'

const detach = attachHistoryKeys(root, () => doc.history)
```

An Undo or Redo button that undoes or redoes the last step disables itself, and the browser would move focus to `<body>`, out of reach of the keys. `createUndo`, `createRedo` and the binding buttons move it to the scroll element instead. For your own buttons, mark them `data-ink-undo` or `data-ink-redo` and call `keepHistoryFocus(root, () => scrollElement)`.

On a focused annotation, `Enter` or `Space` selects it and calls `onActivate`; what activation opens is up to the host.

Locked annotations, such as those embedded in the file, ignore move, resize and delete. Without a text selection, `Enter` in the `highlight` and `redact-area` tools does nothing.

`redact-area` draws an area mark when you drag, even from a highlight. To redact text instead, select the text with the `select-text` tool, switch to `redact-area`, then click inside the selection or press `Enter`. The tool keeps the press from starting a new text selection, so it cannot select text itself.

`sketch` draws freehand ink, one annotation per stroke. A stroke that looks like a line, an arrow, a rectangle, an ellipse, a polygon or a star becomes that shape, in the shape style. A click, or a stroke under 4 CSS px across, stays ink. One undo turns the shape back into the stroke, and a second removes the stroke. Draw each shape in one stroke: for an arrow, draw the shaft, then the head, without lifting. The recogniser is exported from `@inkbar/core` for your own input: `recogniseStroke(points)` takes user-space points and returns the shape with a score from 0 to 1, or `undefined` when the points fit no shape. A stroke counts as a shape at `RECOGNISE_THRESHOLD` (0.8) or above.

The `shape` tool's `loupe` kind adds a loupe: a circle that shows the page under its centre at `magnification` times the size (2 by default), with a rim in the shape style's border colour and width. A drag sizes it, always as a circle, and a click places one 72 pt across. It needs a pointer: `Enter` places no loupe. It magnifies the page itself, not the annotations under it, and redraws a moment after it moves, resizes or the zoom changes. Pass the overlay a `document` (page mounts and the viewer do) or a loupe shows only its rim.

The `shape` tool's `mask` and `ovalMask` kinds add a mask: the page is dimmed everywhere outside a rectangle or an ellipse (`shape: 'rect' | 'ellipse'`), by `dim` (0 to 1, 0.5 by default) in black. A drag sizes it, with `Shift` for a square or circle, and a click places one 72 pt across. Like the loupe it needs a pointer: `Enter` places no mask. A page has one mask: adding a second replaces the first in the same undo step, and in a controlled store in the same `onChange`. The dimming is an SVG (`svg[data-ink-mask-layer]`) between the page and the annotation overlay that never takes the pointer; the mask annotation's own element is the shape, and only a thin band along its edge takes presses. Inside the shape the page works as usual: select text, highlight it, add shapes or notes. The style controls have nothing to change on a mask.

With either select tool (`select-text` or `select`), or on what a one-shot tool just made, a selected area redaction, text box, shape, loupe, mask, polyline, polygon or drawing shows four corner handles (`.ink-handle[data-handle="nw|ne|sw|se"]`), and a selected line shows one on each end (`data-handle="start|end"`). Dragging a corner resizes the annotation, scaling its points with it; `Shift` keeps its aspect ratio. Dragging a line end moves that end only. The store records a single update on release. Drag the annotation itself to move it, or any member of a multi-selection to move them all in one undo step. Text markup in the selection stays on its text unless it is the one you drag.

A press on text markup (a highlight, underline, strikeout or squiggly) does nothing at first. A click selects it; a drag selects the text under it, as a drag on the bare text would. Presses on every other annotation select it straight away.

## Plugins

A plugin adds commands, tools, annotation decorations, page layers and its own records to a viewer. Write it once with `definePlugin` from `@inkbar/core/dom` and it runs in every framework package and in `createViewer`.

```ts
import type { RecordBase, Rect } from '@inkbar/core'
import { definePlugin } from '@inkbar/core/dom'

interface Suggestion extends RecordBase {
  page: number // 0-based
  rect: Rect // in PDF user space
  reason: string
  status: 'suggested' | 'dismissed'
}

// The id is lower-case kebab; everything the plugin adds is named under it.
export const review = definePlugin('review', (plugin) => {
  // The open document's `review.suggestions` records; empty while none is open.
  const suggestions = plugin.records<Suggestion>('suggestions')

  // Placed as 'review.suggest'. The returned string becomes the command's status.
  plugin.command('suggest', 'Suggest redactions', async ({ doc, signal }) => {
    const found = await findSuggestions(doc, { signal }) // your own code
    return `${suggestions.in(doc).addMissing(found).length} suggestions`
  })

  // A button over each open suggestion, opening a card styled by `@inkbar/theme`.
  plugin.marks(suggestions, {
    where: (s) => s.status === 'suggested',
    rect: (s) => s.rect,
    label: (s) => `Suggested redaction: ${s.reason}`,
    card: (s) => ({
      title: s.reason,
      actions: { Dismiss: () => suggestions.update(s.id, { status: 'dismissed' }) },
    }),
  })
})
```

`definePlugin(id, setup)` checks the id and returns a factory. Pass `plugins: [review()]` to the viewer. Nothing a plugin registers shows by itself: place a command with `InkCommand` (`createCommandButton(viewer, 'review.suggest')` without a framework), and a plugin tool with a tool button, as you place the built-in ones.

Inkbar keeps no plugin data. The host loads and saves a plugin's records through the factory's `records` option, which `plugin.records(name)` picks up by name: `review({ records: { suggestions: { initial, onChange } } })`. `initial(doc)` returns the records a document opens with; `onChange(list, change)` runs after every change. Options passed to `plugin.records(name, { initial, onChange })` win over the host's.

Three rules cover undo and stale results:

- Every records call is one undo step, and `plugin.batch` makes several one step.
- Inside a command, write through `records.in(doc)`. A write through the plain handle after an `await` goes to whatever document is open by then; `in(doc)` writes to the run's document, and nothing once that document closes.
- Each card action is one undo step.

A command's `run` gets `doc`, the document open when it started, and a `signal` that aborts when that document closes or another opens. Returning `undefined` clears the status. A failed run is logged and sets the status to `errorStatus` (default "Something went wrong."); the status clears when the document changes.

Marks redraw when their records change, undo and redo included, and keep their elements, so focus and an open card survive a zoom. Chain `.scrollToFirst()` onto `plugin.marks(…)` to scroll the viewer to new marks: when records start to get a mark, it scrolls to the first in reading order, unless that one is in view already. It moves no focus, and the records a document opens with, undo and redo never scroll. Each carries `data-record` and `data-plugin`; `style` (custom properties included), `className` and `attrs` add your own look. A card has a `title`, optional `label`, `meta`, `swatch` and `body`, and `actions`. Actions must be synchronous: a write after an `await` falls outside the action's undo step. The first action is the primary one and takes focus. After an action that removes the mark, focus moves to the next of this `marks()` call's marks, else the previous one, else the viewport. A mark with a card has `aria-haspopup="dialog"`, and `aria-expanded` is true while its card is open. Escape or a press outside closes the card and returns focus to the mark. `@inkbar/theme` styles `.ink-card`, `.ink-card-title`, `.ink-card-meta`, `.ink-card-swatch`, `.ink-card-body` and `.ink-card-actions`, and the card's `className` adds your own class.

`suggestions.annotates('redact', { from, onRemoved })` links records to the annotations made from them. Its `add(record)` adds an annotation from `from(record)`, stores the link at `custom.<plugin>.<records name>` (here `custom.review.suggestions`) and fills the type's default colour when `from` gives none. `of(record)` returns the linked annotations. `onRemoved(record, annotation)` and `onChanged(record, annotation)` run inside the user's undo step, never on undo or redo. Call it in `setup`. The link travels with the annotation through a Gloss export and import.

`quadsFromRect(rect)` and `rectFromQuads(quads)` from `@inkbar/core` convert between a box and the quads that text markup takes, and `doc.pageText(page)` resolves to a page's text joined the way the page reads: nothing between touching items, a space at line ends and at wide gaps.

### Going further

The `plugin` that `setup` receives is also the plugin's context, so everything below works in the new form. The object form, `definePlugin({ id, setup(ctx) { … } })`, still works and returns the plugin itself: pass `plugins: [plugin]`.

A command added with `ctx.commands.add` is disabled until a document is ready, unless it passes its own `enabled` readable, and it is busy, and disabled, until the promise `run` returns settles. A failed run is logged, never thrown. `ctx.store(name)` gives each document its own record store, keyed `<plugin>.<name>`, and its changes undo with annotation edits; `ctx.onAnnotationEdit(fn)` runs inside each user edit's undo step. `ctx.history.batch(fn)` makes everything `fn` changes, annotations and records alike, one undo step. Load records with `initial(doc)` and save them from `onChange`. `ctx.scrollTo(page, rect)` scrolls the viewer to a rect in user space and moves no focus.

#### Plugin authors

- A layer (`ctx.layer`) lets presses through to the page, and the elements you put straight into it take them back (`pointer-events: auto`), with or without `@inkbar/theme`. That default has no specificity, so a rule of yours such as `pointer-events: none` on a mark wins.
- A tool you add with `ctx.tools.add` is placed under its namespaced id (`review.stamp`), but its methods run on your own object, so inside them `this.id` is the id you gave it (`stamp`). A class instance keeps its `#private` fields.
- Presses on a mark you draw in your own layer bubble up to the viewer's root. Stop propagation if listeners there shouldn't see them. `plugin.marks` does this for you.
- A layer's `destroy` can run after the document's stores have closed, so check `store.get()` for `null` there.
- Decorations from `ctx.decorate` re-apply when the annotations change. Call `ctx.redecorate()` when one reads state of your own that changed. Marks from `plugin.marks` take `refresh()` for the same job.
- The framework packages run `setup` once the viewer has mounted in the browser, never while rendering on the server. Until then the plugin's commands are disabled, and anything `setup` creates, such as a store, doesn't exist yet.

## Search

`doc.search(query, options?)` finds text across the document. The query is a string or a `RegExp`. It returns `SearchResults`: iterate it with `for await` to get hits as pages are scanned, or call `all()` for the lot.

```ts
for await (const hit of doc.search('invoice')) {
  console.log(hit.page, hit.text, `${hit.before}[${hit.text}]${hit.after}`)
}

const refs = await doc.search(/\b[A-Z]{2}\d{6}[A-D]\b/, { signal }).all()
```

Options: `matchCase` (default false; a `RegExp` keeps its own `i` flag), `wholeWord` (a hit must not have a letter, digit or underscore on either side), `pages` (indices to search, in the order given; all pages in order by default) and `signal`, which stops the scan. A string matches the way the page reads: it finds text across line breaks and a hyphenated line end, and ignores accents, ligatures and curly quotes.

Each `SearchHit` has:

- `page`: 0-based page index.
- `start`, `end`: offsets into `doc.pageText(page)`.
- `text`: the page text the hit covers.
- `quads`, `rect`: where it is, in PDF user space. `quads` has one entry per run of text the hit touches, and can go straight into a text markup annotation. Each quad is cut where the page draws its glyphs and spans the font's full height, so it covers ascenders and descenders.
- `exact`: `true` when every quad comes from where the page draws its glyphs. `false` when some of the text could not be matched to them (right-to-left or vertical text, or an unusual file) and its quad is cut at estimated widths, which can fall short. Pad those before using them to cover text, as a redaction does.
- `before`, `after`: up to 40 characters of page text either side.

`viewer.search` is the state and actions behind the viewer's find bar: `state` (a readable of `open`, `query`, `matchCase`, `hits`, `current` and `scanning`), `open(query?)`, `setQuery`, `setMatchCase`, `next`, `previous` and `close`. `open()` runs the search and draws the highlights even with no find bar on the page. Plugins get the same object as `ctx.search`.

```ts
import { createFindBar, createSearchButton } from '@inkbar/core/dom'

toolbar.append(createSearchButton(viewer))
viewer.element.querySelector('[data-ink-viewport-root]')!.append(createFindBar(viewer))
```

`createSearchButton(viewer)` opens the bar. `createFindBar(viewer)` is a field with a match count, previous and next, a match-case toggle and close. Put it inside `[data-ink-viewport-root]`; the theme floats it over the top-right of the pages. Enter steps to the next match, `Shift+Enter` to the previous, and `Escape` closes and returns focus to where it was.

Ctrl/Cmd+F opens the bar when one is mounted and the key comes from inside the viewer, with the page selection (up to 200 characters) as the query. Without a bar, or from outside the viewer, the browser keeps the key.

Hits are drawn as a layer over the page that multiplies with it, so the text shows through. `@inkbar/theme` styles them with `--ink-search-hit` and, for the current hit, `--ink-search-current`.

## Forms

Inkbar fills the AcroForm fields in a PDF and runs the form's scripts. `doc.form` reads and sets the values:

```ts
doc.form.values.get() // { name: 'Ada', agree: 'Yes', ... }
doc.form.set({ name: 'Grace' }) // runs the scripts; one undo step
doc.form.reset() // every field back to the PDF's default
```

Pass `fields: { mode: 'controlled', initial, onChange }` to `openDocument` or `createViewer` to hold the values in your own state. The form never submits, opens a link, sends mail or prints. It hands each request to you: through `onFormAction` on `createViewer` or `mountViewer`, or through `doc.form.on('action', fn)` on a document you opened with `openDocument`.

Each fillable field has a light tint. `formHighlight: false` turns it off when the viewer opens. To change it later, call `viewer.setFormHighlight(on)` on a `createViewer` viewer, or `engine.setFormHighlight(on)` on a `mountViewer` engine. Neither renders a page again, and a focused field keeps its focus and typed text.

The [forms guide](https://inkbar.dev/docs/guides/forms/) covers controlled fields, form actions, scripts, signature fields and saving values as Gloss.

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
