<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-dark.svg">
    <img src="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-light.svg" alt="Inkbar" width="72" height="72">
  </picture>
</p>

<h1 align="center">@inkbar/core</h1>

<p align="center">
  The core of Inkbar: documents, rendering, annotations and tools, with no framework dependency.
</p>

<p align="center">
  <a href="https://inkbar.dev">Website</a> ·
  <a href="https://inkbar.dev/docs/">Docs</a> ·
  <a href="https://sandbox.inkbar.dev">Sandbox</a> ·
  <a href="https://github.com/inkbar/inkbar">GitHub</a>
</p>

---

`@inkbar/core` opens PDFs, renders pages with [`@inkbar/engine`](https://github.com/inkbar/inkbar/tree/main/packages/engine), PDFium compiled to WebAssembly, and keeps annotations as typed data. The Vue, React and Svelte packages build on it. You can also use it on its own: `createViewer` puts a complete viewer, with a comment thread popover and controls to build your toolbars from, into any element in a plain TypeScript app.

Every coordinate is stored in PDF user space (points, origin bottom-left, before `/Rotate`), so annotations stay put whatever the zoom, rotation or screen.

- `@inkbar/core` holds the document model and annotation store. It is safe to import during server rendering.
- `@inkbar/core/dom` renders pages, text layers and annotation layers into the DOM.
- `@inkbar/core/vite` is a Vite plugin that serves Inkbar's files: the engine, the fallback fonts and the form script sandbox.

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

`file` can be a `File`, `Blob`, `Uint8Array`, `ArrayBuffer`, a URL string, `{ url, key }` when the URL is signed and changes between loads, or `{ data, key }` for bytes you want to identify. `quads` is a list of quads in PDF user space.

A document that fails to open still resolves: `doc.status` turns to `{ state: 'error', error }` and `doc.ready` rejects with the `InkError`. Its `code` says why, such as `PasswordRequired` (open again with `password`), `InvalidPdf` or `SourceFetchFailed`. `isInkError(e)` tells an `InkError` from other errors.

`exportAnnotations('json')` returns a [Gloss](https://gloss-format.org) document, an open JSON format for PDF annotations, and `importAnnotations` reads one. Gloss has no loupe, mask, pen pressure or free-text border colour, so Inkbar writes them under `custom.inkbar`. It writes a loupe as a circle and a mask as a circle or square, so other Gloss readers can still draw them. Inkbar leaves your own keys under `custom` as they are. In the store and the API, loupes, masks, `pressure` and `borderColor` keep their plain names.

`doc.save()` writes the annotations and changed form values into the PDF; [Saving into the PDF](#saving-into-the-pdf) explains it. To keep annotations outside the file instead, store `exportAnnotations('json')` and import it on the next open. `doc.key` stays the same between opens only when you open with a key: a URL string, `{ url, key }` or `{ data, key }`. A `File`, `Blob` or raw bytes get a new random key each time.

The DOM layer (`@inkbar/core/dom`) provides the viewport, canvas renderer, text layer, overlay and tools for hosts without a framework package. Vue hosts should use [`@inkbar/vue`](https://github.com/inkbar/inkbar/tree/main/packages/vue), React hosts [`@inkbar/react`](https://github.com/inkbar/inkbar/tree/main/packages/react), Svelte hosts [`@inkbar/svelte`](https://github.com/inkbar/inkbar/tree/main/packages/svelte). Below `mountViewer` sit `createViewport`, `createPageRenderer`, `createTextLayer`, `createOverlay` and `createPageMount`, for a host that wires its own.

### Without a framework

`createViewer` opens a document and renders it into an element, with a comment thread popover for notes and highlights. The toolbars are yours: build them from the controls below, which use the same markup as the framework packages, so `@inkbar/theme` styles them. A viewer registers only `select-text` and `select` until you pass `tools`; `allTools()` returns all eight creation tools if you want every one.

```ts
import {
  createViewer,
  highlightTool,
  noteTool,
  createToolbar,
  createToolButton,
  createPageInput,
  createPageCount,
  createZoomOut,
  createZoomSelect,
  createZoomIn,
} from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'

const viewer = createViewer(el, {
  source: file,
  assets,
  zoom: 'fit-width',
  tools: [highlightTool(), noteTool()],
})

const tools = createToolbar()
tools.append(
  createToolButton(viewer, 'select-text'),
  createToolButton(viewer, 'select'),
  createToolButton(viewer, 'highlight'),
  createToolButton(viewer, 'note')
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

It takes the [`mountViewer` options](#mounting-a-viewer) except `container` and `document`, plus `source` and `assets` (both required), `password`, `passwordPrompt`, `defaults`, `history`, `annotations`, `fields`, `onReady` and `onError`. Pass `annotations: { mode: 'controlled', initial, onChange }` to own the session annotation list: `onChange` hears each proposed list, and you push it back with `viewer.document.get()?.annotations.setControlledValue(next)`. `initial` applies to every document the viewer opens, so a host that keeps its own list pushes it with `setControlledValue` in `onReady` for each new document. Undo and redo are inert in controlled mode. Set `threads` to `false` to leave out the thread popover. `viewer.status`, `viewer.document`, `viewer.engine` (the viewer engine, as `mountViewer` returns it), `viewer.viewport` and `viewer.tools` are readables; the last two change when the viewer engine rebuilds. `viewer.activated` is a readable too: the id of the annotation the user last clicked or activated with Enter, or `null`. `viewer.setActivated(id)` activates one from your code without calling `onActivate`; it ignores an id the document doesn't have, and `setActivated(null)` clears it. A password you pass to `open` replaces the `createViewer` one for that load. `viewer.download({ filename })` and `viewer.print()` download and print the open PDF, and Ctrl or Cmd+S and +P inside the root do the same; they do nothing while no document is open. The download is named by `doc.fileName`: the opened `File`'s name, else the URL's last segment, else `document.pdf`. Printing loads the file into a hidden frame and opens the browser's print dialog for it; on iOS the PDF opens in a new tab instead. Both hand over the file with this session's changes written into it; [Saving into the PDF](#saving-into-the-pdf) has the details. For a host of your own, `downloadDocument(doc, opts)`, `printDocument(doc, { messages })` and `attachFileKeys(el, () => doc, { onError, messages })` do the same for any document. `messages` gives the words a print shows on iOS while the copy is written, English by default; `attachFileKeys` takes a function that returns them, so it reads the current language at each key. `onError` hears a download or print started by a key that fails. `fileBusy(doc)` is a readable that is true while a copy is being written, and `fileActionFailure(error, messages)` gives the words to show for a failed one. The controls are `createToolButton`, `createUndo`, `createRedo`, `createDownloadButton`, `createPrintButton`, `createApplyRedactionsButton` (see [Applying redactions](#applying-redactions)), `createZoomIn`, `createZoomOut`, `createZoomSelect`, `createPageInput`, `createPageCount`, `createPrevPage`, `createNextPage` and `createCommandButton`. `createHighlightMenu`, `createShapeMenu` and `createSignatureMenu` are split buttons for those tools, and `createColorMenu`, `createLineStyleMenu` and `createTextStyleMenu` edit the selection's style, or the active tool's when nothing is selected. Each one disables itself while no document is ready and lives as long as its viewer. Buttons show an icon from [`@inkbar/icons`](https://github.com/inkbar/inkbar/tree/main/packages/icons). Replace their children with your own icon and the accessible name stays; `createIcon` draws any `@inkbar/icons` icon for your own buttons. For a tool the viewer doesn't have, `createToolButton` and the highlight, shape and signature menus log `InkError('UnknownTool')`. The button renders disabled and the menus render nothing. `createToolbar` gives one Tab stop to all its buttons, with arrow keys between them, and `createToolbarSeparator` divides groups of controls in it. `createCommandButton(viewer, id)` places a plugin command: a `div.ink-command` holding a button named by the command's label (disabled with the command; while it runs, it keeps focus with `aria-busy` and `aria-disabled`, and a press does nothing) and a `span.ink-command-status[role="status"]` with its status text; for an id no plugin registered it logs an `InkError('UnknownCommand')` to the console, naming the id and the ones that are registered, and returns the same markup disabled and hidden (`aria-hidden`, no label). Pass `plugins: [...]` to `createViewer` to register plugins; their tools join the viewer's, and `createToolButton` takes a plugin tool's own label and icon. `viewer.commands.get(id)` returns a command. An input, select or textarea you add keeps its arrow keys and its own `tabindex`: it is a Tab stop unless you give it `tabindex="-1"`.

#### Locked files

When a file needs a password, `createViewer` asks for it. The status turns to `{ state: 'locked', incorrect: false }` and a "Password required" dialog opens. `onError` hears the `PasswordRequired` error once for each failed open. A wrong password keeps the dialog open with `incorrect: true`, as does a wrong `password` option. Cancel leaves the status `locked` and shows an "Enter password" button that reopens the dialog. The viewer uses the typed password for that one load and for no other file, and it doesn't reach the status, the error or storage. The open document keeps the password until it closes, because a save, and a restart after the engine stops, open the file again in the engine. Pass `passwordPrompt: false` to turn the prompt off; a locked file is then `{ state: 'error', error }` with code `PasswordRequired`. For a host of your own, `createPasswordDialog({ onSubmit, onCancel })` builds the same dialog.

`createViewer` reads the theme's colours from the element you pass, so that element needs to be in the page when you call it.

### Mounting a viewer

`mountViewer` wires the viewport, page layers, tools and zoom and page keys onto a scroll container. You render the chrome around it. It returns a `ViewerEngine`, the viewer engine. That is part of core and separate from `@inkbar/engine`.

```ts
import { mountViewer, highlightTool } from '@inkbar/core/dom'

const engine = mountViewer({
  container, // a focusable, scrollable element
  document: doc,
  zoom: 'fit-width',
  tools: [highlightTool()],
  onPageError: (page, error) => console.warn(page, error),
})
engine.tools.set('highlight')
engine.rebuild({ gap: 32 }) // construction-only options; zoom, page, tool and scroll position carry over
engine.destroy()
```

Options:

- `container` and `document`, both required.
- `tools`: the creation tools to register (`allTools()` or the ones you import from `@inkbar/core/dom`). `select-text` and `select` are always present.
- `zoom` (a number, `'fit-width'` or `'fit-page'`; default `'fit-width'`), `page`, `mode`, `rotation` and `tool` set the starting view. Change them later through `engine.viewport` and `engine.tools`.
- `fonts`: the font families text boxes offer (default: the PDF standard families).
- `gap`, `buffer`, `pinchZoom` and `customAnnotations` are fixed for a build. Change them with `engine.rebuild`.
- `pinchZoom` (default `true`): a two-finger pinch over the container, a trackpad pinch or ctrl+wheel zooms the document. One mouse wheel notch with ctrl held zooms by 10%. Two fingers also scroll the document. Set it to `false` and the browser handles pinches itself, zooming the whole page.
- `toolOptions` holds the tools' options, such as the shape kind. Pass one from `createToolOptions()` and keep it to carry the options over to the next document; `createViewer` keeps one for its whole life. The tool style (colours, line style, text style) belongs to the document: each new document starts from the theme's defaults.
- `storage` is what the viewer keeps between visits, such as saved signatures (see [Signatures](#signatures)); `signatureFonts` lists the handwriting fonts a typed signature offers.
- `decorateAnnotation(annotation)` returns your own `data`, `classes` and `description` for an annotation's element, or `undefined`. `{ data: { 'my-flag': 'on' } }` writes `data-my-flag="on"`, and `description` becomes the element's `aria-description`. Inkbar re-applies them whenever the annotations change. Call `engine.redecorate()` when they depend on anything else. Core's own attributes and `ink-` classes always win.
- `onActivate(id)` fires when the user activates an annotation.
- `onBuild(viewport, tools)` fires after every build, the first one included, before `mountViewer` returns. Subscribe to the new viewport and tool controller here.
- `onPageMount(page, mount, host)` and `onPageUnmount(page)` fire as pages enter and leave the mounted range.
- `onPageError(page, error)` reports a page whose canvas or text layer failed, and `onPageError(page, null)` once every failed layer renders again. Unmounting a failed page emits no `null`, so clear any per-page error in `onPageUnmount`.
- `onError(error)` hears `EngineUnavailable` once each time the document stops (see [When the engine stops](#when-the-engine-stops)).

To open your own card next to an annotation, use `createPopover`: it anchors a panel to the annotation's element, follows it as pages mount and unmount, and calls your `onDismiss` on Escape or a press outside. `placePanel` positions a panel against any other rectangle.

The viewport mounts pages synchronously, so a build's page callbacks fire before its `onBuild`. During a rebuild, `engine.viewport` and `engine.tools` still point at the destroyed objects while those callbacks run. Read the arguments instead, or wait for `onBuild`.

## When the engine stops

The engine runs in a worker. If it stops while a file is open, core starts a new one and opens the file in it again, and the reader sees nothing. When that fails, or the engine has stopped three times within 60 seconds, the document is stopped: `doc.engineStopped`, a readable, is true, every read rejects with `EngineUnavailable`, and `doc.status` stays `ready`. A page whose reads stopped the engine twice is blocked on its own: its reads reject with `EngineUnavailable`, with `details.page` naming the page, it shows its page error, and the other pages read on.

`doc.restartEngine()` starts a new engine and opens the file in it again. It resolves once the document reads again, and rejects with `EngineUnavailable` when it does not, leaving the document stopped. Either way the session's annotations, form values and history stay as they were. A restart reads every page again, blocked pages included. On a document that is not stopped it does nothing, and a blocked page stays blocked.

While the document is stopped, `doc.save()` with no changes still resolves with the bytes the file was opened from. With changes it rejects with `EngineUnavailable`, and so does `doc.applyRedactions()`.

`mountViewer`, and so `createViewer` and the Vue, React and Svelte packages, shows a notice over the pages while the document is stopped: "The viewer stopped working. Your changes are kept.", with a "Try again" button that calls `doc.restartEngine()`. While the restart runs the button is busy and the notice reads "Starting again…". When it works the notice goes and the pages draw again; when it fails the first words come back. The notice is `[data-ink-engine-notice]` with `role="alert"`, and its words are `engineStopped`, `engineRetry` and `engineRestarting` in the `viewer` group of `messages`. It goes just before the viewer's scroll element and is placed against its nearest positioned ancestor, so a host that calls `mountViewer` itself gives the container a positioned parent, such as one with `position: relative`. `createViewer` does this for you.

While the notice is up, annotating pauses: the pages take no input, so no tool draws and no form field takes typing, no annotation activates, and undo and redo do nothing. Scrolling, zooming and the sidebars keep working, and pages already drawn keep their image. Download and Print stay enabled; with changes they show a message that saving is not available while the viewer is stopped. `onError` on `mountViewer` and `createViewer`, and the `error` event of each framework package, hear `EngineUnavailable` once each time the document stops.

## Saving into the PDF

Download, Print, Ctrl or Cmd+S and Ctrl or Cmd+P hand over the file with this session's annotations and changed form values written into it, and `doc.save()` resolves with the same bytes. With no changes, a save gives the bytes the file was opened from. With changes, it writes through the document's engine, so that engine must be running: while the document is stopped ([When the engine stops](#when-the-engine-stops)), `doc.save()` rejects with `EngineUnavailable`. `doc.getData()` always gives the bytes the file was opened from.

A host that calls `openDocument` itself passes one more option, `pictures`. In a browser `savePictures(document)` from `@inkbar/core/dom` supplies it. `createViewer` and the Vue, React and Svelte bindings pass it for you.

```ts
import { openDocument } from '@inkbar/core'
import { savePictures } from '@inkbar/core/dom'

const doc = await openDocument(file, {
  assets,
  pictures: savePictures(document),
})
```

`pictures` gives a save three things from the browser: a picture of each line of text the standard fonts cannot set, a PNG copy of an image that is neither PNG nor JPEG, and the text widths the screen uses. Without it, `doc.save()` lays text out with the standard fonts' own widths, so a line can break at a different word in the file than on screen. A text box with Chinese, Arabic or emoji text then fails the save with `SaveFailed`, and so does a stamp whose image is WebP.

`doc.changed` is a readable that is true while the session differs from the file: its annotations from those it opened with, or a form value from the file's. The file's values are the ones the form holds when `ready` resolves. A value you set after that is a change, and so is one you pass at open.

### What goes into the file

- Each annotation becomes a standard PDF annotation that other programs can list, select and delete: a highlight is a Highlight, a note a Text annotation, a text box a FreeText, a drawing an Ink annotation, and so on. A loupe or a mask becomes a Stamp. Its look is drawn from the same description the screen uses, so it matches what you see in Inkbar, apart from the differences below. A comment goes in the annotation's contents, and replies are saved as replies.
- Changed form values. Fields you did not change keep the look they came with.
- A redaction mark becomes a Redact annotation. A save does not apply it: the text and images under it are still in the file and can still be copied. [Applying redactions](#applying-redactions) removes them.

A file with a digital signature is saved by appending the changes after the signed bytes, so the signature still verifies; other viewers report that the file changed after signing. Any other file is rewritten. An encrypted file keeps its password.

Appending keeps the earlier versions of a signed file inside it. If you delete or edit an annotation that an earlier Inkbar save wrote into a signed file, a reader can still recover the old one from the earlier version. A rewrite, which every unsigned file gets, drops it.

A saved loupe holds a copy of its whole page's content, fonts and images included, and shows the part under the lens. If you redact that page later in another tool, the original content stays in the file inside the loupe. When Inkbar [applies redactions](#applying-redactions), every loupe it writes gets a copy of the redacted page. A loupe that stays locked keeps its old copy, and the apply then fails (see the limits there). On a page with large images the copy also adds to the file's size.

### Opening a saved file

Annotations Inkbar saved come back as session annotations, with the same ids, ready to edit. Saving again replaces them, so each one is in the file once. They are not an undo step and do not count as a change. They arrive a moment after `ready`, as one `replace` change with `reason: 'file'`; until then the file's copy shows, locked. A signature saved on a signature field comes back on the field, and the field shows as signed. `doc.embedded`, the summary of the file's annotations, stops counting them when they arrive.

In controlled mode `onChange` proposes them once, with `reason: 'file'`: your list with the saved annotations added. Apply that proposal as you apply any other, by pushing the list back. Until you push a list, the viewer does not show the saved annotations, and every save still keeps them in the file. The framework packages' undo history takes your answer as its starting point, so undo does not remove them. Redaction marks taken over from other programs, described below, are proposed the same way. A list you push without one of them removes it from the file on the next save with changes, or the next apply.

Annotations made by other programs stay locked, except unapplied Redact annotations. Those open as editable redaction marks that look like Inkbar's own and count in the apply confirmation. A mark keeps its area, fill colour and overlay text. The apply draws that text as it draws the text of Inkbar's own marks, so the other program's font, size and repeat setting do not carry over. A save with changes, or an apply, removes the other program's copy and its pop-up window from the file and writes Inkbar's mark. A Redact annotation stays locked in an encrypted file, when another program's annotation replies to it, and when its pop-up window is not listed on the same page or does not name the mark as its parent. Two rarer cases also keep it locked: the page's annotation list holds it written inline, or Inkbar cannot read its data as a mark. A locked mark is drawn by the page, skipped by the apply and counted in `foreignMarks`.

An annotation Inkbar saved also stays locked if another program has since moved, edited or replied to it, or given it a pop-up window. Inkbar's own replies to a note that stays locked stay locked with it. In an encrypted file, Inkbar's own annotations come back locked too.

### Where the saved file differs from the screen

- Text with characters outside the standard fonts, such as Chinese, Arabic or emoji, is saved as a picture of the line, at four pixels per point. It blurs at high zoom and cannot be selected. The annotation's contents keep the text.
- The standard fonts (Helvetica, Times and Courier) are not embedded, so each viewer draws them with its own equivalent. Widths match; letter shapes can differ slightly.
- A note's drop shadow is not saved.
- A loupe in the saved file magnifies the page's content only, not the annotations or form fields under it.
- Form fields look as the engine draws them, not as Inkbar draws them on screen.
- Another viewer may redraw an annotation its user edits there.
- The file grows a little each time it is saved and opened again: about 1.5 KB for a file with eighteen annotations. Saving several times in one session does not add to it.

XFA forms are not supported.

### When a save fails

When the engine cannot write the file, `doc.save()` rejects with `SaveFailed`. Its `details.stage` is `'write'`: the engine could not open or write this file, or an annotation could not be drawn for it. When one annotation is the cause, `details.annotation` holds its id. Download and Print then hand over nothing, the viewer says why in its message box, and `onError` hears the error. While a copy is being written the Download and Print buttons show they are busy, and another press does nothing. The written copy is kept until the next change, so Print after Download does not write the file twice.

### Applying redactions

`doc.applyRedactions()` removes the content under every redaction mark of the session and resolves with `{ bytes, result }`: the redacted file and what was done. The engine works on the file as it was opened:

1. It removes the text, image samples and drawing under each mark, and leaves an opaque box in the mark's fill colour in its place, with the mark's overlay text if it has one.
2. It removes every annotation a mark overlaps, Inkbar's and the file's own, except masks and redaction marks from other programs that stayed locked. Then it writes the other annotations and the changed form values.
3. It removes the file's metadata, attached files, scripts, page thumbnails and private application data.
4. It rewrites the whole file, so no earlier version stays inside it.
5. It checks the saved bytes under each mark. The check reads the file's objects, so content hidden under an opaque box counts. When it finds anything, the apply fails and hands nothing over.

The apply covers every mark of the session. Marks Inkbar saved earlier count as marks, and in an encrypted file, where they come back locked, the engine applies them too. Redact annotations from other programs open as marks and are applied with the rest. Those that stayed locked stay in the file, unapplied, and are counted. Download, Print and `doc.save()` never apply a mark.

The open document does not change: its annotations, `doc.changed`, `doc.save()` and `doc.getData()` stay as they were. To show the redacted file, open the bytes. From the model, with a confirmation of your own:

```ts
const preview = doc.redactionPreview()
if (await ask(preview)) {
  const { bytes, result } = await doc.applyRedactions()
  await upload(bytes)
}
```

`doc.redactionPreview()` gives the counts a confirmation needs without calling the engine: `marks`, `pages`, `overlapped` (the other annotations the marks overlap) and `signed`. In an encrypted file, `lockedMarks` counts the locked Redact annotations. Some may be marks Inkbar saved earlier, which the apply removes the content under. Others may come from other programs, which core cannot tell apart; `result.ownLockedMarks` says how many were applied.

An apply never overlaps a save. A save that has started writing finishes first; one that has not may run after the apply. A second call while an apply runs gets the same promise.

In a viewer, `createApplyRedactionsButton(viewer)` is the control, and `viewer.applyRedactions()` runs the same action from code:

```ts
import {
  createViewer,
  createToolbar,
  createToolButton,
  createApplyRedactionsButton,
  redactAreaTool,
} from '@inkbar/core/dom'

const viewer = createViewer(el, {
  source,
  assets,
  tools: [redactAreaTool()],
  onRedacted: ({ bytes }) => store(bytes),
})

const bar = createToolbar()
bar.append(createToolButton(viewer, 'redact-area'), createApplyRedactionsButton(viewer))
viewer.element.prepend(bar)
```

The button shows "Apply redactions" as text. It is disabled while no document is ready and while there is no mark. While the marks are applied it says "Applying redactions…", keeps focus with `aria-busy` and `aria-disabled`, and a press does nothing. The document takes no input while redactions are being applied, until the redacted file has replaced it or the apply has failed: the pages take no presses or keys and do not scroll, Undo and Redo are disabled and their keys do nothing, an open comment thread or signature menu closes and no thread opens, the style menus change no annotation, plugin commands are disabled, plugin list actions do nothing, an open plugin card closes and none opens, and Download and Print are disabled. Meanwhile a polite live region beside the pages (`[data-ink-redaction-status]`, visually hidden with `.ink-visually-hidden`) says "Applying redactions…" for screen readers.

A press, or `viewer.applyRedactions()`, asks first with the built-in "Apply redactions?" dialog. It says how many marks on how many pages will have the content under them removed, and that this cannot be undone. It adds a line when the marks overlap other annotations, which go too, when the file is signed, since its signature will stop verifying, and when an encrypted file holds marks saved earlier, which are applied too unless another program made them. When the only marks are those saved earlier in an encrypted file, the dialog leaves out the count of marks and pages, and the line about earlier marks comes first. Focus starts on Cancel. When the document closes or another opens, the dialog closes and nothing is applied. To ask your own way, pass `redactionConfirm: (preview) => Promise<boolean>` to `createViewer`: it gets `doc.redactionPreview()`, and resolving true applies. `redactionConfirm: false` applies without asking.

The engine refuses a mark over content it cannot remove from the file, before anything changes. The apply removes text, blanks image samples and cuts paths. A file can also define content once and paint it through a reference, and cutting the shape that paints it would leave that content in the file. The engine refuses a mark that touches a shape painted with a tiling pattern, a picture gradient (a mesh or function-based gradient, or a linear or radial gradient whose colour function is not a simple ramp), artwork under a soft mask that holds more than a simple fade, or a Type 3 glyph that paints outside the box it declares. A simple ramp blends from colour to colour in at most eight stretches. A simple fade is a soft mask made of at most four plain rectangles or simple-ramp gradients, which is how gradient transparency is drawn. Hatching and textures are tiling patterns, and drop shadows and feathered edges are usually drawn with soft masks that hold more than a fade. Covering the whole shape does not help. Content under a simple fade, and linear and radial gradients with a simple ramp, are redacted. Move or delete the refused marks and apply again.

When the apply fails, nothing is handed over and the open document stays as it was. `doc.applyRedactions()` rejects with `EngineUnavailable` while the document is stopped (see [When the engine stops](#when-the-engine-stops)), with `NothingToRedact` when there is no mark or the engine applied none (every mark has no area or lies wholly off its page), and with `RedactionFailed` when the engine cannot finish. Its `details.stage` is:

- `'apply'` when the engine refused the marks, or could not apply them or write the rest. `details.page` and `details.annotation` name the page and the annotation when one was the cause.
- `'verify'` when the check could not run or did not find every mark's place clean. `details.regions` lists the page and rectangle of each place it did not find clean, and `details.page` names a page the check could not read.

A refusal has `details.reason: 'unremovable-content'`. `details.annotations` lists the ids of every refused mark, `details.annotation` holds the first, `details.kinds` says what was found (`'pattern'`, `'shading'`, `'mask-group'`, `'glyph'`) and `details.page` names the first page. When the engine could not look under the marks, `details.reason` is `'could-not-inspect'`.

In a viewer, a failure shows in the message box, `onError` hears the error, and `viewer.applyRedactions()` resolves with null. For a refusal the message says how many marks cover content that cannot be removed, and the viewer selects them. When only marks saved earlier in an encrypted file caused the refusal, the error names no mark, the viewer selects nothing, and the message says one mark. A failure is not reported once another document is showing or the viewer is destroyed.

After a successful apply, `onRedacted({ bytes, result })` hears the redacted file, which a host that stores files stores. The viewer then reopens on those bytes with the same key, file name, page, zoom, layout mode, rotation and tool, and with the password the file was opened with. The marks are gone, undo history starts over, and Download and Print give the redacted file. Once the redacted file shows, the message box says how many redactions were applied, and adds a line when the file has hidden layers or other programs' marks were left. In controlled mode Inkbar proposes the host's list without the marks it applied and the annotations removed with them, with reason `'redaction'`, and the reopened document starts from that list. A mark the host adds while the apply runs stays in that list. If `onRedacted` throws, the reopen still happens and `onError` hears a `RedactionFailed` with `details.callback: 'onRedacted'` and what it threw as its `cause`; an `InkError` it throws reaches `onError` as it is. `viewer.applyRedactions()` resolves with `result`, or with null when the reader cancelled or nothing was applied.

`result` holds:

- `marks` and `pages`: the marks applied and the pages they were on. A mark with no area or wholly off its page is skipped, and a mark drawn in several pieces applies without its pieces that have no area.
- `removed.session`: the ids of the session annotations removed with the content. `removed.file`: how many of the file's own annotations went, pop-up windows included.
- `foreignMarks`: other programs' Redact annotations that stayed locked and were left unapplied. `ownLockedMarks`: Inkbar's earlier marks applied in an encrypted file.
- `fieldsSkipped`: the names of the changed form fields not written, because a mark removed their widgets.
- `sanitised`: what was removed from the file. `hiddenLayers` and `signed`: whether the file has hidden layers, and whether it held a digital signature.
- `findings`: what the check found under each mark: places and verdicts, never the file's text.

For a host of your own, `runRedaction(doc, { confirm })` asks and applies without reopening anything, and resolves with `{ bytes, result }`, or with null when cancelled or when a run of that document is already going. `canRedact(doc)` and `redactionBusy(doc)` are readables for a control's disabled and busy states (after `applyRedactionsFlow` hands back a file to open, `doc` stays busy: it is to be closed for that file), `redactionFailure(error, messages)` gives the words for a failed run, and `createRedactionDialog({ onConfirm, onCancel, messages })` builds the same dialog. To build your own viewer or framework binding, `applyRedactionsFlow(doc, opts)` runs what `viewer.applyRedactions()` does up to the reopen and tells you what to open, with the view to keep and the message to show; `redactionDoneMessage(result, messages)` gives that message on its own, to build when it shows so it follows a language change made during the reopen. A controlled host with a snapshot history calls `history.replaced()` (from `createSnapshotHistory`) in the flow's `proposed` hook, so the host's answer to the `'redaction'` proposal starts the history again instead of being an undo step.

The words are in the `viewer` group of `messages` (see [Translations](#translations)): `applyRedactions` and `redacting` for the button; `redactTitle`, `redactSummary`, `redactLocked`, `redactPermanent`, `redactOverlapped`, `redactSigned`, `redactConfirm` and `redactCancel` for the dialog; `redactFailed`, `redactUnremovable`, `redactUnverified` and `redactUnavailable` for a failure; and `redactDone`, `redactHiddenLayers` and `redactForeign` for the message once the redacted file shows.

Known limits:

- Inkbar does not clean hidden layers. `result.hiddenLayers` says when the file has them, and the viewer's message says so too.
- The removed words may also appear where Inkbar does not look: bookmark titles, comments on other annotations, form values, alternate text for screen readers.
- Inkbar removes what lies under a mark. It does not find copies of that content hidden elsewhere in the file: a second use of the same graphic that is cropped, covered or on another page, or a pattern or gradient that another page also uses.
- A scanned page is one image: a mark removes the pixels under it, and there is no text to remove. OCR text layers are removed like any text.
- Scripts are removed, so forms stop calculating.
- A signed file's signature stops verifying.
- The engine refuses a mark over patterned fills, picture gradients, soft-masked artwork that holds more than a simple fade, and out-of-box Type 3 glyphs, as described above, even when the mark covers the whole shape.
- An Inkbar loupe that comes back locked, in an encrypted file or after another program edited it, keeps a copy of its page made before the apply. When that page has a mark and no mark overlaps the loupe, the check reads the copy, finds what lay under the mark, and the apply fails with `RedactionFailed` at `stage: 'verify'`. The apply removes every annotation a mark overlaps, locked ones included, so drawing a mark over the loupe as well lets the apply go through. For a loupe another program edited, you can also delete it in that program. For an encrypted file, you can also save a copy without the password in another program and redact that: Inkbar's loupes come back editable there, unless that program changed them, and the apply rewrites them.
- Text set at an angle close to a mark's edge can make the check fail, though the apply removed everything under the mark (20-point text beside a turned mark, for example). Move the mark a little further from that text.
- The check also fails, and the reader sees "Some content could not be removed", for an image that has both a soft mask and a separate stencil mask, and it can fail for a very low-quality JPEG.
- A crafted file can make the apply and its check take a long time. To check files from elsewhere, run `checkRedaction` from [`@inkbar/engine`](https://github.com/inkbar/inkbar/tree/main/packages/engine#checking-a-redaction) on an engine of its own, in its own worker, with a timeout.

## Annotation changes

`doc.annotations.on('change', fn)`, and `onChange(next, change)` in controlled mode, describe each mutation:

- `{ kind: 'add', annotation }`
- `{ kind: 'update', id, before, after }`
- `{ kind: 'remove', annotation, removed }`. Removing a note also removes its replies, so `removed` lists everything that went: `annotation` first, then the replies. A host that syncs by change should delete every id in `removed`.
- `{ kind: 'replace', reason }` for an import, a history step or a controlled sync. Read the whole list.

`add` throws if `input.id` is already in the list. Locked annotations refuse changes to their geometry, `page` and `contents`.

`doc.history.batch(fn)` records everything `fn` changes as one undo step, so a host that adds many annotations at once can undo them together. Change events still fire once per annotation. `fn` must be synchronous, and nested calls join the outer batch. In controlled mode `doc.history` records nothing; the framework packages' `useHistory().batch` works in both modes.

## PDF names in annotations

Values taken from PDF names use PDF's spelling: `OpenArrow` and `ROpenArrow` for line endings, `Comment` and `NewParagraph` for note icons, `FreeTextCallout` and `LineArrow` for intents. Other valid PDF names (no spaces, none of `( ) < > [ ] { } / %`) are kept and written back unchanged, so `icon: 'Check'` survives an import and export. `LINE_ENDINGS`, `NOTE_ICONS` and `INTENTS` list the names Inkbar knows, and `isKnown(list, name)` tests one. A line ending Inkbar does not know draws as `None`. A note icon Inkbar does not know draws the note's square with no glyph. `Comment`, `Note`, `Help`, `Insert`, `Key`, `NewParagraph` and `Paragraph` each have a glyph.

## Callouts and speech bubbles

A free-text callout is stored as PDF and XFDF store it: `intent: 'FreeTextCallout'`, a `rect` that holds the text box and the leader line together, a `fringe` (`{ left, top, right, bottom }`, PDF `/RD`) that insets `rect` to the text box, and a `callout` of two or three points running from the tip, through an optional bend, to where the line meets the box. `head` is the ending at the tip.

A speech bubble is a standard callout plus Inkbar's `cornerRadius`. Inkbar draws it as one rounded outline with a wedge to the tip. Other viewers ignore `cornerRadius` and draw a box with a leader line.

A callout's corner handles resize its text box: the tip and bend stay, and the point on the box moves with the edge it sits on. Its tip handle moves the tip alone. Each edit refits `rect` and `fringe` in the same update, so it is one undo step.

## Text boxes

Inkbar draws a text box from its annotation alone. The fill, border, dashes, corner radius, alignment, opacity and text style all come from the annotation, and the drawing is the single description of the box that the page, the thumbnails and the editor's backdrop paint. The text is SVG and the press area over it is a transparent SVG rect (`[data-ink-text-area]`). Both are painted as inline style with priority `important`, so a rule on an HTML class, on the text elements or on SVG shapes (`rect { fill: red }`), with `!important` or without, cannot change their paint. The other shapes that only take presses (a stamp's, a loupe's, a mask's edge, the wider hit area of a line) are painted the same way. Their paint is locked against stylesheets: fill, stroke, opacity and fonts are set inline with priority `important`. A stylesheet adds or changes only what surrounds the drawing (the theme's outlines, a note's drop shadow and comment markers, the in-place editor `.ink-free-text`, the handles and the selection frame), and can still hide, move or filter elements, for example with `display`, `transform` or `filter`.

A note is drawn the same way: a rounded square in the annotation's own colour with its icon's glyph, as SVG, so `--ink-note` does not recolour notes on the page. It sets the colour a new note starts with, as the other colour variables do. A note from a file with no appearance is drawn in the colour the file gives it, or in the default note colour when the file gives none. The note's square is the press area, glyph included. The only theme rule on a note is its drop shadow, which shows on screen only. The glyph stays upright for the page as the file displays it and turns with the view when the user rotates it.

A text box uses one of three font families that a PDF reader has without embedding a font: Helvetica, Times and Courier, each in regular, bold, italic and bold italic. Any other `fontFamily` stays on the annotation and is drawn in the nearest of the three: a name that reads as serif in Times, one that reads as monospace in Courier, and the rest in Helvetica.

Inkbar measures the text itself, from width tables for the standard character set (the letters, digits, punctuation and accented letters of the Windows Western encoding), so a box breaks its lines in the same places on every machine. A character outside that set has no table width. Its width is an estimate and it is drawn in whatever font the browser finds, so a line that holds one can break differently depending on the fonts installed. The text is drawn as SVG, turns with the view, and is upright for the page as the file displays it.

## Limits of PDF import

Inkbar reads the annotations embedded in a PDF in two passes. The first, before `ready`, passes on only part of each one. Import keeps `intent` (`/IT`) for every type. Once the document is ready, Inkbar reads from the file itself the fields the first pass leaves out: a FreeText's `callout`, `fringe`, `head` and font, and a note's icon. They arrive as one `replace` change with `reason: 'embedded'`. That change adds no undo step and keeps the undo history.

Inkbar does not read callout, icon or font fields from encrypted PDFs, from annotations stored as direct objects, or from a file with a broken cross-reference table.

One gap remains:

- Keep line endings Inkbar does not know on lines and polylines. The first pass turns them into `None`. Annotations loaded from JSON keep them.

## Tools and keyboard

`createToolController` from `@inkbar/core/dom` routes pointer and key events on the viewport to the active tool. Without `tools` it has `select-text` and `select`, plus whatever tools you pass; `allTools()` gives the other eight: `highlight`, `redact-area`, `sketch`, `draw`, `shape`, `freetext`, `signature` and `note`. Highlights, text redactions, notes, shapes, text boxes and signatures can be made from the keyboard. Area redactions, freehand drawing, loupes and masks need a pointer.

Most creation tools are one-shot: `shape`, `freetext`, `note`, `redact-area` and `signature` each make one thing, select it, then hand back to `select-text`. After a one-shot tool has made something, a press on empty page or `Escape` clears the selection and switches to `select-text` without making anything more. The press that closes a new text box, or a new note's popover, counts as that press too. Until then, what it made keeps its edit handles: drag it to move it, drag a handle to resize it, and the tool stays on. A press on another annotation switches to `select-text` and selects it, and a drag moves it. Removing what the tool made (`Delete`, undo, or a controlled host refusing the add) leaves the tool on for another go, and the selection moving to something else switches to `select-text`. Picking a tool again starts it afresh. While the tool waits for that press, the viewport carries `data-ink-made`. `draw`, `sketch` and `highlight` are sticky: they stay on until you pick another tool.

A host tool says which it is with `kind: 'one-shot' | 'sticky'` (no `kind` is sticky). A one-shot tool adds and selects what it makes, then calls `ctx.made(ids)`; `ctx.done()` clears the selection and switches to `select-text` itself. Under a sticky tool, `ctx.made` does nothing. The controller's `active` readable reports every switch, including one a one-shot tool makes.

On a touch screen, `draw`, `sketch`, `shape`, `redact-area` and `freetext` take one-finger drags: one finger draws and two fingers scroll and zoom. A finger tap with `draw` or `sketch` draws nothing, while a pen tap or a mouse click makes a dot. A pen that lands while a palm rests on the screen takes over and draws. A one-shot tool gives one-finger scrolling back once it has made something. A host tool opts in with `claimsTouch: true`; while it is active, one finger no longer scrolls the document. For this the controller sets `touch-action` on the pages element (`[data-ink-pages]`) and removes it when the tool changes, so a value of your own there is lost.

| Where focus is               | Key                                           | Effect                                                                                                                            |
| ---------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Viewport, `highlight` tool   | `Enter`                                       | Turns the text selection into a highlight                                                                                         |
| Viewport, `redact-area` tool | `Enter`                                       | Turns the text selection into text redactions                                                                                     |
| Viewport, `note` tool        | `Enter`                                       | Places a note at the centre of the current page and focuses it                                                                    |
| Viewport, `signature` tool   | `Enter`                                       | Places the chosen signature at the centre of the current page                                                                     |
| Viewport                     | `+` or `=`, `-`                               | Zoom in, zoom out                                                                                                                 |
| Viewport                     | `Home`, `End`, `PageUp`, `PageDown`           | First, last, previous, next page                                                                                                  |
| Viewer root, toolbars too    | `Ctrl` or `Cmd` + `Z`                         | Undo                                                                                                                              |
| Viewer root, toolbars too    | `Ctrl` or `Cmd` + `Shift` + `Z`, `Ctrl` + `Y` | Redo                                                                                                                              |
| Annotation                   | `Enter` or `Space`                            | Selects and activates it (`Enter` edits a text box)                                                                               |
| Annotation                   | `ArrowUp`, `ArrowDown`                        | Previous or next annotation on the page, in reading order                                                                         |
| Annotation                   | `Shift` + arrow                               | Moves it 1 pt (`Shift` + `Alt` + arrow: 10 pt)                                                                                    |
| Annotation                   | `Ctrl` or `Cmd` + `Shift` + arrow             | Resizes an area redaction, text box, shape, loupe, mask or signature image by 1 pt. Right and Down grow it, Left and Up shrink it |
| Annotation                   | `Delete` or `Backspace`                       | Removes it                                                                                                                        |
| Annotation                   | `Escape`                                      | Clears the selection                                                                                                              |

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

An Undo or Redo button that undoes or redoes the last step disables itself, and the browser would move focus to `<body>`, out of reach of the keys. Back and Forward do the same at either end of the history. `createUndo`, `createRedo`, `createBack`, `createForward` and the binding buttons move focus to the scroll element instead. For your own buttons, mark them `data-ink-undo`, `data-ink-redo`, `data-ink-back` or `data-ink-forward` and call `keepHistoryFocus(root, () => scrollElement)`.

On a focused annotation, `Enter` or `Space` selects it and calls `onActivate`; what activation opens is up to the host. On an editable text box, `Enter` opens the editor instead.

Locked annotations, such as those embedded in the file, ignore move, resize and delete. Without a text selection, `Enter` in the `highlight` and `redact-area` tools does nothing.

`redact-area` draws an area mark when you drag, even from a highlight. To redact text instead, select the text with the `select-text` tool, switch to `redact-area`, then click inside the selection or press `Enter`. The tool keeps the press from starting a new text selection, so it cannot select text itself.

`sketch` draws freehand ink, one annotation per stroke. A stroke that looks like a line, an arrow, a rectangle, an ellipse, a polygon or a star becomes that shape, in the shape style. A click, or a stroke under 4 CSS px across, stays ink. One undo turns the shape back into the stroke, and a second removes the stroke. Draw each shape in one stroke: for an arrow, draw the shaft, then the head, without lifting. The recogniser is exported from `@inkbar/core` for your own input: `recogniseStroke(points)` takes user-space points and returns the shape with a score from 0 to 1, or `undefined` when the points fit no shape. A stroke counts as a shape at `RECOGNISE_THRESHOLD` (0.8) or above.

The `shape` tool's `loupe` kind adds a loupe: a circle that shows the page under its centre at `magnification` times the size (2 by default), with a rim in the shape style's border colour and width. A drag sizes it, always as a circle, and a click places one 72 pt across. It needs a pointer: `Enter` places no loupe. It magnifies the page itself, not the annotations under it, and redraws a moment after it moves, resizes or the zoom changes. Pass the overlay a `document` (page mounts and the viewer do) or a loupe shows only its rim.

The `shape` tool's `mask` and `ovalMask` kinds add a mask: the page is dimmed everywhere outside a rectangle or an ellipse (`shape: 'rect' | 'ellipse'`), by `dim` (0 to 1, 0.5 by default) in the mask's `color` (black by default). A drag sizes it, with `Shift` for a square or circle, and a click places one 72 pt across. Like the loupe it needs a pointer: `Enter` places no mask. A page has one mask: adding a second replaces the first in the same undo step, and in a controlled store in the same `onChange`. The dimming is an SVG (`svg[data-ink-mask-layer]`) between the page and the annotation overlay that never takes the pointer; the mask annotation's own element is the shape, and only a thin band along its edge takes presses. Inside the shape the page works as usual: select text, highlight it, add shapes or notes. The style controls have nothing to change on a mask.

With either select tool (`select-text` or `select`), or on what a one-shot tool just made, a selected area redaction, text box, shape, loupe, mask, signature image, polyline, polygon or drawing shows four corner handles (`.ink-handle[data-handle="nw|ne|sw|se"]`), and a selected line shows one on each end (`data-handle="start|end"`). Dragging a corner resizes the annotation, scaling its points with it; `Shift` keeps its aspect ratio. Dragging a line end moves that end only. The store records a single update on release. Drag the annotation itself to move it, or any member of a multi-selection to move them all in one undo step. Text markup in the selection stays on its text unless it is the one you drag.

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

Marks redraw when their records change, undo and redo included, and keep their elements, so focus and an open card survive a zoom. Chain `.scrollToFirst()` onto `plugin.marks(…)` to scroll the viewer to new marks: when records start to get a mark, it scrolls to the first in reading order, unless that one is in view already. It moves no focus, and the records a document opens with, undo and redo never scroll. Each carries `data-record` and `data-plugin`; `style` (custom properties included), `className` and `attrs` add your own look. A card has a `title`, optional `label`, `meta`, `swatch`, `body` and `excerpt` (a line of context with the match marked), and `actions`. Actions must be synchronous: a write after an `await` falls outside the action's undo step. `onActivate(record, mark)` runs when a mark is clicked or activated with `Enter` or `Space`, after its card opens. The first action is the primary one and takes focus. After an action that removes the mark, focus moves to the next of this `marks()` call's marks, else the previous one, else the viewport. A mark with a card has `aria-haspopup="dialog"`, and `aria-expanded` is true while its card is open. Escape or a press outside closes the card and returns focus to the mark. `@inkbar/theme` styles `.ink-card`, `.ink-card-title`, `.ink-card-meta`, `.ink-card-swatch`, `.ink-card-body`, `.ink-card-excerpt` and `.ink-card-actions`, and the card's `className` adds your own class.

Your marks' card also gives you a list. `createRecordList(viewer, { records: 'review.suggestions' })` (`InkRecordList` in the framework packages) lists the records that have a mark, each as the card the mark opens, with the same actions in the same undo step. See [Record lists](#record-lists).

`suggestions.annotates('redact', { from, onRemoved })` links records to the annotations made from them. Its `add(record)` adds an annotation from `from(record)`, stores the link at `custom.<plugin>.<records name>` (here `custom.review.suggestions`) and fills the type's default colour when `from` gives none. `of(record)` returns the linked annotations. `onRemoved(record, annotation)` and `onChanged(record, annotation)` run inside the user's undo step, never on undo or redo. Call it in `setup`. The link travels with the annotation through a Gloss export and import.

`quadsFromRect(rect)` and `rectFromQuads(quads)` from `@inkbar/core` convert between a box and the quads that text markup takes, and `doc.pageText(page)` resolves to a page's text joined the way the page reads: nothing between touching items, a space at line ends and at wide gaps.

### Reading records from your app

`viewer.records(key)` gives your app the records a plugin keeps, under the key `<plugin>.<name>` (`review.suggestions`). It is the plugin's own handle less `annotates`, and it follows the open document: `list` is a readable that emits as records change, and `[]` while nothing is open. The same key returns the same handle. Writes are undo steps like the plugin's own, and `batch(fn)` makes several one step. An unknown key returns an empty handle that ignores writes, and logs a warning once.

```ts
const suggestions = viewer.records<Suggestion>('review.suggestions')
suggestions.list.subscribe((items) => render(items))
suggestions.batch(() => {
  suggestions.update('s1', { status: 'dismissed' })
  suggestions.remove('s2')
})
```

### Going further

The `plugin` that `setup` receives is also the plugin's context, so everything below works in the new form. The object form, `definePlugin({ id, setup(ctx) { … } })`, still works and returns the plugin itself: pass `plugins: [plugin]`.

A command added with `ctx.commands.add` is disabled until a document is ready, unless it passes its own `enabled` readable, and it is busy, and disabled, until the promise `run` returns settles. A failed run is logged, never thrown. `ctx.store(name)` gives each document its own record store, keyed `<plugin>.<name>`, and its changes undo with annotation edits; `ctx.onAnnotationEdit(fn)` runs inside each user edit's undo step. `ctx.history.batch(fn)` makes everything `fn` changes, annotations and records alike, one undo step. Load records with `initial(doc)` and save them from `onChange`. `ctx.storage` is the other place to keep things: an `InkStorage` scoped to `plugin.<id>`, shared across documents and visits, for settings such as a panel width. It reads and writes the viewer's `storage`, so it is memory unless your app passes a store. Use `ctx.store()` for records that undo with edits. `ctx.scrollTo(page, rect)` scrolls the viewer to a rect in user space and moves no focus.

#### Plugin authors

- A layer (`ctx.layer`) lets presses through to the page, and the elements you put straight into it take them back (`pointer-events: auto`), with or without `@inkbar/theme`. That default has no specificity, so a rule of yours such as `pointer-events: none` on a mark wins.
- A tool you add with `ctx.tools.add` is placed under its namespaced id (`review.stamp`), but its methods run on your own object, so inside them `this.id` is the id you gave it (`stamp`). A class instance keeps its `#private` fields.
- Presses on a mark you draw in your own layer bubble up to the viewer's root. Stop propagation if listeners there shouldn't see them. `plugin.marks` does this for you.
- A layer's `destroy` can run after the document's stores have closed, so check `store.get()` for `null` there.
- Decorations from `ctx.decorate` re-apply when the annotations change. Call `ctx.redecorate()` when one reads state of your own that changed. Marks from `plugin.marks` take `refresh()` for the same job.
- The framework packages run `setup` once the viewer has mounted in the browser, never while rendering on the server. Until then the plugin's commands are disabled, and anything `setup` creates, such as a store, doesn't exist yet.

### Publishing a plugin

A plugin you publish lists `@inkbar/core` under `peerDependencies`, so the app and every plugin share one copy. Add it under `devDependencies` too, for your own build and tests, and never under `dependencies`: a second copy would give your plugin its own `InkError` and `Readable` classes.

```json
{
  "name": "@acme/inkbar-review",
  "version": "1.0.0",
  "type": "module",
  "peerDependencies": {
    "@inkbar/core": "^0.14.0"
  },
  "devDependencies": {
    "@inkbar/core": "^0.14.0"
  }
}
```

Import `definePlugin` from `@inkbar/core/dom`, and import every type with `import type`, so the types add nothing to your bundle. Every named type reachable from `InkPlugin`, `PluginContext`, `PluginApi` and `PluginOptions` is exported from `@inkbar/core` or `@inkbar/core/dom`, and a test keeps it that way. Export the factory your users call:

```ts
import { definePlugin } from '@inkbar/core/dom'

export const review = definePlugin('review', (plugin) => {
  // …
})
```

### Presses

`ctx.onPress(fn)` and `ctx.onLongPress(fn)` tell a plugin about a press on a page that nothing in Inkbar acted on. Each returns a function that stops listening, and listeners are removed when the plugin is torn down.

```ts
ctx.onPress(({ page, point, pointerType }) => console.log(page, point, pointerType))
ctx.onLongPress(({ page, point }) => openMenu(page, point))
```

The payload is `{ page, point, pointerType }`. `page` is a zero-based index, `point` is in user space on that page (points, origin bottom-left, before `/Rotate`), and `pointerType` is `'mouse'`, `'touch'` or `'pen'`.

A press is a pointer going down and up on a page without moving more than a few pixels. A mouse click is a press. A touch or pen held still for about half a second is a long press instead: it fires while the finger is still down, and the release reports nothing more. A mouse never long-presses. A touch that becomes part of a pinch before a long press fires is neither, and so is one that starts a scroll.

Both fire only under the text and rectangle select tools; any other tool owns every press. They stay silent when something else took the press: an annotation, a resize handle, a link, a form field, a plugin mark or a text editor. A press that commits an open text editor or closes a popover reports nothing either. Inkbar leaves the browser's own long-press behaviour alone, so text selection and context menus still work.

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
- `exact`: `true` when every quad comes from where the page draws its glyphs. `false` when some of the text could not be matched to them (right-to-left text, or an unusual file) and its quad is cut at estimated widths, which can fall short. Pad those before using them to cover text, as a redaction does.
- `before`, `after`: up to 40 characters of page text either side.

`viewer.search` is the state and actions behind the viewer's find bar: `state` (a readable of `open`, `query`, `matchCase`, `hits`, `current` and `scanning`), `open(query?)`, `setQuery`, `setMatchCase`, `next`, `previous`, `select(index)` and `close`. `open()` runs the search and draws the highlights even with no find bar on the page. Plugins get the same object as `ctx.search`.

```ts
import { createFindBar, createSearchButton } from '@inkbar/core/dom'

toolbar.append(createSearchButton(viewer))
viewer.element.querySelector('[data-ink-viewport-root]')!.append(createFindBar(viewer))
```

`createSearchButton(viewer)` opens the bar. `createFindBar(viewer)` is a field with a match count, previous and next, a match-case toggle and close. Put it inside `[data-ink-viewport-root]`; the theme floats it over the top-right of the pages. Enter steps to the next match, `Shift+Enter` to the previous, and `Escape` closes and returns focus to where it was.

Ctrl/Cmd+F opens the bar when one is mounted and the key comes from inside the viewer, with the page selection (up to 200 characters) as the query. Without a bar, or from outside the viewer, the browser keeps the key.

Hits are drawn as a layer over the page that multiplies with it, so the text shows through. `@inkbar/theme` styles them with `--ink-search-hit` and, for the current hit, `--ink-search-current`.

## Sidebars

`createSidebar` builds a sidebar of panels, each showing an element you give it. It needs no document or viewer: place it beside the viewer with your own flex or grid layout.

```ts
import { createSidebar } from '@inkbar/core/dom'
import { Square } from '@inkbar/icons'

const { element, controller } = createSidebar({
  layout: 'rail',
  side: 'left',
  panels: [
    { id: 'pages', label: 'Pages', icon: Square },
    { id: 'notes', label: 'Notes', badge: 3 },
  ],
  content: { pages: pagesElement, notes: notesElement },
  onOpenChange: (open) => console.log(open),
})
shell.prepend(element)
```

Each panel has an `id`, a `label`, an optional `icon` (an `IconNode` from `@inkbar/icons`) and an optional `badge`, a number or short string hidden when empty or 0. In the rail, the open panel shows its label as a title above its content. Pass `visible: false`, or call `controller.update({ visible })`, to hide the whole sidebar and keep its open panel, content and scroll for when it shows again: a results sidebar shown only while a search has hits, for instance.

`layout` is one of:

- `rail` (default): a vertical strip of icon buttons on the inner edge, beside the document, with the label as a tooltip. One panel is open at a time; activating the open panel's button closes it, leaving only the rail.
- `tabs`: labelled tabs across the top with one panel open. Pass `open: null` to collapse the sidebar, from a toolbar button of your own for instance.
- `stack`: every panel as a section with a header button, one under another, any number expanded.

`side` (`left` by default) decides which edge the rail and border sit on. `open` is the open panel id (`string | null`) for rail and tabs, and the expanded ids (`string[]`) for stack. Without it the sidebar starts with the first panel open and keeps its own state. With it the sidebar is controlled: a click reports the new value through `onOpenChange` and nothing changes until you call `controller.update({ open })`. When `update({ panels })` removes the open panel, rail and tabs open the first one left and stack drops it; the new value goes to `onOpenChange` either way.

Closed panels stay in the document with `hidden`, so their content keeps its state and scroll position. Rail and tabs follow the WAI-ARIA tabs pattern: one Tab stop, arrow keys (Up and Down on the rail, Left and Right for tabs), Home and End to move, Enter or Space to open. Stack headers follow the accordion pattern: each is a Tab stop with `aria-expanded`, and Up and Down move between them.

To render your own markup, use `createSidebarController(options)`, which holds the same state and behaviour. Spread `rootAttrs()` on the root, `tablistAttrs()` on the element holding the buttons, `triggerAttrs(id)` on each button and `panelAttrs(id)` on each panel, then call `bindTriggers(element)` once on an element containing the buttons. It handles clicks and keys and keeps the Tab stop right as buttons are re-rendered. `sidebarBadge(badge)` gives the text a badge shows, or `null` when it is hidden. Pass `idPrefix` when the markup is rendered on the server, so the element ids match on the client. A binding whose panels register one by one passes `pending: true` until they are all in, then `update({ pending: false })`: meanwhile a controlled `open` id not registered yet is kept instead of falling back, and the root reports the open state it will have. An uncontrolled sidebar created with no panels opens the first one to arrive.

Every sidebar has a resize handle on its inner edge. Drag it, or focus it and use the arrow keys (16px a step, mirrored on a right-hand sidebar so the arrow points the way the edge moves), Home and End. Enter or a double-click resets the width. The width starts at `defaultWidth` (320) and stays between `minWidth` (240) and `maxWidth` (480). Pass `width` to control it and `onWidthChange` to hear about changes. The handle is labelled "Resize left sidebar" or "Resize right sidebar"; pass `handleLabel` to name it yourself. With custom markup, spread `rootStyle()` on the root, `handleAttrs()` on the handle and `panelsAttrs()` on the panels element, then call `bindHandle(handle)`.

Sidebars whose roots share a parent element make room for the document together. While the document beside them would be narrower than the minimum document width, a rail sidebar's open panel floats over the pages instead, like a drawer. The rail stays in place, so its buttons can still close and reopen the panel. The sidebar being resized floats first, then the one opened most recently, until the document has room. When the parent grows again, the panel goes back beside the document. A floating root has `data-overlay`, which `@inkbar/theme` uses to lift the panel above the pages. Tabs and stack sidebars never float: they narrow toward `minWidth` instead. Either way the saved and reported width stays the one the reader chose. An uncontrolled sidebar that has no room at its first measurement starts with its panel closed and reports `null` through `onOpenChange`; a controlled `open` is left as it is. All of this is decided in the browser once the parent is measured, so server-rendered sidebars sit beside the document.

Set the minimum document width with `createSidebar({ minDocumentWidth })`, in CSS pixels (480 by default, exported as `MIN_DOCUMENT_WIDTH`). It is read once, when the sidebar is created. Give every sidebar that shares a parent the same value: where they differ, the largest wins.

A floating panel closes on a tap anywhere else in the parent (the pages, say) or on `Escape`, the way a drawer does. Opening the find bar closes it too, so the panel never covers the bar: any `[data-ink-find-bar]` in the same `[data-ink-root]` counts, or in the sidebars' parent when there is no root, and focus stays in the bar's field. The closing tap does nothing else: no tool draws, no link is followed and no field takes focus. A drag, a scroll, a pinch or a second finger leaves the panel open, and so does a press in another sidebar, a menu, a popover or a dialog. `Escape` is left alone when something else has handled it, while the reader is composing text with an input method, and when focus is in a menu, popover or dialog or outside the sidebars' parent. Closing goes through `onOpenChange` like any other close, so a controlled sidebar closes only when you set `open`. Focus moves to the rail button of the panel that closed, unless it was somewhere else on the page, such as a field the reader was typing in.

To keep the width between visits, pass `storage` (see the storage section) and a `name`. The width is saved under `sidebar.<name>.width`. Both are read once, when the sidebar is created.

`@inkbar/theme` sizes the sidebar with `--ink-sidebar-width` and the rail with `--ink-sidebar-rail-width` (48px). The sidebar sets `--ink-sidebar-width` inline, so a CSS override of it no longer applies. Pass `defaultWidth` instead. Override the rail per sidebar with CSS.

## Thumbnails

`createThumbnail(viewer, { page })` draws one page of the open document as a small image, with its annotations and plugin marks on top. Put it anywhere: a sidebar panel, a dialog, a card.

```ts
import { createThumbnail } from '@inkbar/core/dom'

panel.append(createThumbnail(viewer, { page: 3, width: 120 }))
```

`page` is 0-based. Give `width` or `height` in CSS pixels and the other follows the page's shape and its own /Rotate (the viewer's rotation does not apply); `width` wins when you give both. With neither, the width is `--ink-thumbnail-width` as the thumbnail's element computes it, so set the token on the viewer root, the sidebar or any ancestor. It is read when the thumbnail is placed, when it comes near the visible area and on each `update` that lays it out again. Only positive px values count: another unit, zero, a negative value or none gives 120px. `annotations: false` and `marks: false` leave those layers out. `label` replaces the accessible name, "Page 4" for page 3.

A thumbnail is an image to assistive technology (`role="img"`), with no focus and no click behaviour of its own: wrap it in a button or link for that. It renders once it comes within 200px of the visible area and shows a placeholder of the right size before then, and while no document is open. Form fields show the values saved in the PDF. Annotations follow edits, undo and redo, and marks are drawn with the plugin's class and style but take no presses.

To paint into your own element, call `createThumbnailPainter(element, { document, pluginHost }, options)` with readables of the document and, for marks, the plugin host. It adds the `ink-thumbnail` class, its role, name, size and layers, and leaves the element's own classes and children alone. `update(options)` applies changed options and `destroy()` removes everything it added. `thumbnailSize(pageInfo, { width, height })` gives the size and zoom a thumbnail of that page gets.

### A list of pages

`createThumbnails(viewer, options)` lists the pages as thumbnails, each a button that scrolls the viewer to its page. It fills its parent's height and scrolls, so put it in a sidebar panel or any box with a height.

```ts
import { createThumbnails } from '@inkbar/core/dom'

panel.append(createThumbnails(viewer))
panel.append(createThumbnails(viewer, { pages: [0, 3, 7], width: 96 }))
```

`pages` lists those pages in that order (0-based); without it every page is listed. The thumbnails fill the list's width less a 16px gutter each side and follow it as it resizes. Set `--ink-thumbnail-width` to a positive px value on the list or an ancestor to draw them that wide instead; the list caps it at that fit, so they never overflow. The theme leaves the token unset. The list reads it when attached and on each resize; before the list is attached and shown it has no width to fit, so the thumbnails are as wide as the token, else 120px. `width` fixes them at that many pixels whatever the list's width and the token. `annotations` and `marks` work as they do for one thumbnail. The current page has `aria-current="page"` and scrolls into view in the list when it changes, unless the list was scrolled by hand in the last second. The list is one Tab stop: arrow keys move between pages, Home and End go to the first and last, Enter or Space opens one.

Only the items near the visible part of the list are in the document, so a 500-page file stays cheap. When the list scrolls away from the focused item, focus moves to the first visible one without scrolling back.

To render your own items, use `createThumbnailsController({ document, pluginHost, viewport }, options)`. Its `state` gives the `pages` listed, the `current` page (-1 with no viewport), the `window` of indexes into `pages` to mount the `offsets` of each item from the top of the list (the last is the total height) and the `width` to draw each thumbnail at. Render a spacer of the total height and each item in the window at its offset, as a button with `data-ink-thumbnail-item` set to its page and a `createThumbnailPainter` at that `width` inside, wrapped in an element with `itemAttrs(index)` spread on it: its `listitem` role, and `aria-setsize` and `aria-posinset` for its place among all the pages, as only the window is mounted. An item's height is its thumbnail's plus 38px for the 16px gutter above it, a 6px gap and its 16px number, as the theme draws it. Call `attach(scrollElement)` once the list is in the document: it follows scrolling, handles clicks and keys, and sets each item's `tabindex`. `activate(page)` scrolls the viewer to a page, and `update(options)` takes new options.

## Record lists

`createRecordList(viewer, { records })` lists a plugin's records as cards, the same cards their marks open, with the same actions. It fills its parent's height and scrolls, so put it in a sidebar panel or any box with a height.

```ts
import { createRecordList, createSearchResults } from '@inkbar/core/dom'

panel.append(createRecordList(viewer, { records: 'review.suggestions' }))
```

Each record takes its card from the first `plugin.marks` call over those records whose `where` it passes, and the list shows only records that pass one. Records that no `marks` call covers are all listed, titled with their id, with no actions. Pass `where`, `card` or `sort` to choose for yourself; actions on a card you pass run in one undo step too. The default order is by page, then top to bottom and left to right by the mark's rect.

The list and the marks share one selection per records key, so every list over the same records agrees with the marks. Clicking a card, or Enter on it, selects the record, gives its mark `data-selected` and scrolls the viewer to it. Focus stays in the list and no popover opens. Activating a mark selects its card and scrolls every list over those records to it, inside the list, without moving the page; a list in a closed panel scrolls when it shows. Escape in the list clears the selection, and so does removing the record or undoing it away. A `where` of yours that is stricter than the marks' hides a selected record from your list but leaves it selected, for the marks and other lists. Choosing a record that no `marks` call covers scrolls to it without selecting it.

The list is one Tab stop: arrow keys move between cards, Home and End go to the first and last. When the focused card goes, after an action, an undo or any other change, focus moves to the next card, else the previous one, else the list. A polite live region says "3 items" when an action or your app adds or removes cards, again when the count repeats, but not on undo or redo. With nothing listed it shows "Nothing here yet."

`createSearchResults(viewer)` is the same list over the viewer's search: one card per hit, titled with its page ("Page 2"), with its place on that page ("Match 3") and the text around it. Choosing a card makes its hit current, as next and previous in the find bar do, and the find bar's current hit is the selected card. It has its own query field, labelled "Find in document", above the cards and the find bar's match count in a footer below them. Both share the viewer's search state, so they never disagree. Pass `{ field: false }` to leave the field out when a find bar is on the page. A hit's id is `<page>:<n>`, its place among that page's hits, so it stays the same while the scan adds hits from other pages. Escape in the results does not clear the current hit. If you render your own field, `handleResultsFieldKey(event, search)` gives it the find bar's Enter and Shift+Enter. `isBlankQuery(query)` says whether a query counts as no query at all, as the search treats it: the list shows its empty text only then.

To render your own cards, build a source with `recordsSource({ pluginHost, viewport }, key, options)` or `searchSource(search)` and pass it to `createRecordListController(source)`. Its `rows` give each item, its card and whether it is selected, and `count` and `announcement` give the count and the live-region text. Render each row as an element with `data-ink-record` set to the item's id, call `attach(element)` on the element holding them, and call `act(id, label)` from each action button. `attach` handles clicks and keys, sets each row's `tabindex` and scrolls the selected row into view. `choose(id)` selects and reveals an item from code. A source of your own needs `items` (each with an `id`, a 0-based `page` and an optional `rect`), `card`, `selected`, `select`, `reveal`, `run` and `replaying`.

`@inkbar/theme` styles the list with `.ink-records`, `.ink-record-list`, `.ink-record` and `.ink-record-list-empty`, and the selected card with `aria-current="true"`.

`createThumbnail`, `createThumbnails`, `createRecordList` and `createSearchResults` follow the viewer and stop when it is destroyed, not when you remove their element. For a short-lived use, a dialog or a popover for instance, call `createThumbnailPainter(element, deps, options)` or `createRecordListController(source)` and its `destroy()` when you close it.

## Outline and links

`createOutline(viewer)` shows the document's outline (its bookmarks) as a tree. It fills its parent's height and scrolls, so put it in a sidebar panel or any box with a height.

```ts
import { createBack, createForward, createOutline } from '@inkbar/core/dom'

panel.append(createOutline(viewer, { emptyText: 'No sections' }))
toolbar.append(createBack(viewer), createForward(viewer))
```

Clicking an item, or Enter on it, goes to its destination without changing the zoom. Its chevron expands and collapses it. Items start expanded or collapsed as the file says, bold and italic titles keep their style, and the file's colours are ignored. Items Inkbar cannot follow, such as one pointing into another file, are greyed out with `aria-disabled`. The item the reader has reached is marked with `aria-current="location"` and scrolls into view unless focus is in the tree. It is the last item whose destination is at or above a line one third down the view, or at the bottom of the view once it is scrolled to the end, so the last sections can be reached. An item you jump to stays marked until you scroll away from it. Inside a collapsed parent, the parent is marked instead. With no outline the panel shows "This document has no outline", or your `emptyText`.

The tree follows the WAI-ARIA tree pattern and is one Tab stop. Up and Down move between items. Right expands an item, then moves to its first child. Left collapses an item, then moves to its parent. Home and End go to the first and last items, `*` expands the item's siblings, and typing jumps to the next title starting with what you typed.

Links in the PDF work without any setup. A click or tap follows one, and a drag that starts on a link still selects text. Drawing tools work over links, and a click with a modifier key held does not follow one. Each link is also a focusable element with a name, so Tab reaches links and form fields in reading order. Inkbar never opens a URL itself. An outline item or link with a URL calls `onAction` with `{ kind: 'open-url', url, newWindow }`, and only http, https, mailto and tel URLs get that far:

```ts
createViewer(el, {
  source,
  assets,
  onAction: (a) => {
    if (a.kind === 'open-url') window.open(a.url, '_blank', 'noopener')
  },
})
```

Following a link or an outline item records where you were. `viewer.back()` and `viewer.forward()` move through those positions, `canGoBack` and `canGoForward` say whether they can, and `createBack(viewer)` and `createForward(viewer)` are toolbar buttons for them. Scrolling and the page buttons record nothing. The history keeps 50 positions and clears when another document opens. There are no keyboard shortcuts for it, so Alt+Left stays the browser's.

`doc.outline()` gives the outline as data: `OutlineItem`s with an `id` (its path, such as `"1.0"`), `title`, `target`, `bold`, `italic`, `open` and `children`. It is read on the first call and cached; a read that fails gives `[]` and is read again on the next call. To render your own tree, use `createOutlineController({ document, viewport, navigation })` with readables of the document, the viewport and the navigation. A viewer engine's `navigation` is a plain object, so wrap it, and the viewport too (a readable of your own should publish the new viewport after `engine.rebuild`):

```ts
const controller = createOutlineController({
  document: { get: () => doc, subscribe: () => () => {} },
  viewport: { get: () => engine.viewport, subscribe: () => () => {} },
  navigation: { get: () => engine.navigation, subscribe: () => () => {} },
})
```

Spread `treeAttrs()` on the tree (a `ul`) and `itemAttrs(id)` on each item (an `li`). Each item holds a row, with `rowAttrs(id)`, holding the chevron and the title, which gets `titleAttrs(id)` and names the item, then its children in a `role="group"` list shown only while `expanded` has its id. The controller's JSDoc has the full markup. Pass `onKeydown` to the tree's keydown, call `activate(id)` on a row click and `toggle(id)` from the chevron, and call `bindScroll(scrollElement)` to keep the current item in view. `@inkbar/theme` styles `.ink-outline`, `.ink-outline-item`, `.ink-outline-row` (indented by `--ink-outline-level`), `.ink-outline-toggle` (a 44px column, a full touch target), `.ink-outline-title` and `.ink-outline-empty`, with the `--ink-outline-indent`, `--ink-outline-item-height` and `--ink-outline-current-bg` tokens.

## Forms

Inkbar fills the AcroForm fields in a PDF and runs the form's scripts. `doc.form` reads and sets the values:

```ts
doc.form.values.get() // { name: 'Ada', agree: 'Yes', ... }
doc.form.set({ name: 'Grace' }) // runs the scripts; one undo step
doc.form.reset() // every field back to the PDF's default; pass names to reset some
```

Pass `fields: { mode: 'controlled', initial, onChange }` to `openDocument` or `createViewer` to hold the values in your own state. The form never submits, opens a link, sends mail or prints. It hands each request to you: through `onAction` on `createViewer` or `mountViewer`, or through `doc.form.on('action', fn)` on a document you opened with `openDocument`.

Each fillable field has a light tint. `formHighlight: false` turns it off when the viewer opens. To change it later, call `viewer.setFormHighlight(on)` on a `createViewer` viewer, or `engine.setFormHighlight(on)` on the viewer engine `mountViewer` returns. Neither renders a page again, and a focused field keeps its focus and typed text.

An empty signature field opens a menu of your saved signatures in `createViewer` (`createSignFieldMenu`). With `mountViewer`, handle `onSignField(req)` and call `signField` with the one picked. A script's `app.alert` shows in a message box (`createFormAlert`); pass `onFormAlert(message)` to show it yourself. A failing form script reaches `onError` as `FormScriptError`. `viewer.form` is a readable of the open document's form. `exportAnnotations('json')` also writes the form's values under `fields`, and `importAnnotations` restores them without an undo step. Saving writes changed values into the file itself (see [Saving into the PDF](#saving-into-the-pdf)). XFA forms are not supported.

The [forms guide](https://inkbar.dev/docs/guides/forms/) covers controlled fields, form actions, scripts, signature fields and saving values as Gloss.

## Signatures

A signature here is a mark on the page, not a cryptographic signature of the file. Draw one, type your name in a handwriting font, or upload a scan, and it is saved as a template. The `signature` tool places the chosen template: a click puts it about 150 pt wide, centred on the press, and `Enter` puts it at the centre of the current page. It is turned against the page's `/Rotate`, so it reads upright on the page; a view rotation turns it with the page. A drawn signature becomes `ink` and the others a `stamp` (an image), both with `subject: 'Signature'`. Both keep their aspect ratio when resized.

Your app owns the templates. They are kept in the viewer's `storage` under the key `signatures`. Pass `storage: createLocalStorage()` to keep them in `localStorage`, which falls back to memory where storage is blocked; the default is `createMemoryStorage()`, which forgets everything on reload. Any `InkStorage` works, including an async one that talks to your server. `createStorageSignatureStore(storage, key)` is the same store as a `SignatureStore`. When a `save` rejects, the dialog says the browser's storage is full if the error was a quota error, and otherwise that the signature couldn't be saved. An uploaded image is scaled to at most 1000 px on its long side before it is stored. Typed signatures use the fonts in `signatureFonts`. Load each one with `@font-face` before offering it.

`createSignatureMenu(viewer)` lists the saved signatures, removes them, and opens `createSignatureDialog`, which draws, types or uploads a new one and, when the signature tool is registered, selects it.

## Storage

Inkbar keeps a few small things between visits, such as sidebar widths. Where they go is up to your app. Inkbar never touches `localStorage`, cookies or the network unless the store you pass does.

An `InkStorage` has three methods. Each may return a value or a promise, and values are JSON:

```ts
interface InkStorage {
  get(key: string): unknown | Promise<unknown>
  set(key: string, value: unknown): void | Promise<void>
  remove(key: string): void | Promise<void>
}
```

Core ships two stores:

- `createMemoryStorage(initial?)` is the default. It forgets everything on reload and copies values in and out.
- `createLocalStorage(prefix = 'inkbar')` writes JSON to `localStorage` under `<prefix>:<key>`. It reads on every call, so another tab's write shows. It falls back to memory where storage is blocked. When storage is full, `set` rejects with an `Error` whose `cause` is the original, and the old value stays.

`scopeStorage(storage, prefix)` wraps a store so every key gains `<prefix>.`. Plugins get one scoped to `plugin.<id>`.

A store that talks to your server:

```ts
import type { InkStorage } from '@inkbar/core'

const rest: InkStorage = {
  get: async (key) => {
    const res = await fetch(`/api/prefs/${encodeURIComponent(key)}`)
    return res.ok ? res.json() : undefined
  },
  set: async (key, value) => {
    const res = await fetch(`/api/prefs/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    })
    // Reject so the signature dialog can say the signature was not saved.
    if (!res.ok) throw new Error(`Saving ${key} failed: ${res.status}`)
  },
  remove: async (key) => {
    await fetch(`/api/prefs/${encodeURIComponent(key)}`, { method: 'DELETE' })
  },
}
```

The keys Inkbar uses:

- `signatures`: an array of signature templates.
- `sidebar.<name>.width`: a sidebar's width, a number in CSS pixels.
- `plugin.<id>.<key>`: whatever a plugin stores.

## Translations

Every string Inkbar shows comes from `messages`, English unless you pass otherwise. French and German ship as separate entry points, so a bundler drops the ones you don't import. Both are drafts: corrections are welcome as issues.

```ts
import { createViewer } from '@inkbar/core/dom'
import { fr } from '@inkbar/core/locales/fr'

const viewer = createViewer(el, {
  source: file,
  assets,
  messages: { ...fr, find: { ...fr.find, field: 'Chercher' } },
})
```

A set is nested by feature area, and `messages` takes a partial one: a key you leave out stays English. Passing `messages` again replaces the last value, so overrides don't pile up. Each set carries its `lang` (`fr.lang === 'fr'`). Without a `locale`, the viewer root's `lang` attribute and note dates follow it, so `messages: fr` alone reads as French to a screen reader. Pass `locale` to override that.

A message with values is a function of one params object. Write your language by hand, or call your translation function from it. A generic `t` stands in for yours:

```ts
import { plural, template, type InkMessagesInput } from '@inkbar/core'

declare function t(key: string, params?: object): string

const messages: InkMessagesInput = {
  lang: 'es',
  find: {
    field: t('find.field'),
    count: ({ current, total }) => t('find.count', { current, total }),
  },
}

// Or build the function from text. `plural` picks a form by the language's plural rule.
const results = plural('en', 'count', { one: '{count} result', other: '{count} results' })
const found = template('en', 'Page {page} of {total}')
```

`template` and `plural` format numbers for the language you give them, so 1200 reads `1,200` in English and `1.200` in German. The shipped sets are built with them.

Switching language does not remount the viewer, reload the document or move the scroll position, and an open menu, popover or dialog stays open:

```ts
import { de } from '@inkbar/core/locales/de'

viewer.setMessages(de)
viewer.setLocale('de-CH') // optional
```

Pieces made without a viewer, such as `createToolbar`, follow it when you pass `viewer.messages`:

```ts
const bar = createToolbar({ messages: viewer.messages })
```

Text you supply is yours to translate. A tool's `label`, a toolbar's or panel's `label`, a sidebar's `handleLabel`, an outline's `emptyText`, a plugin command's label and `errorStatus`, and a card's `title`, `label` and action labels each take a string or a function. Inkbar calls the function when it renders and again on every `setMessages` or `setLocale`, so the label follows your language:

```ts
import { createToolbar, definePlugin } from '@inkbar/core/dom'
import type { RecordBase, Rect } from '@inkbar/core'

interface Note extends RecordBase {
  page: number // 0-based
  rect: Rect
  text: string
}

const bar = createToolbar({ label: () => t('toolbar'), messages: viewer.messages })

const run = () => 'Done'

definePlugin('review', (plugin) => {
  const notes = plugin.records<Note>('notes')

  plugin.command('suggest', () => t('suggest'), run, {
    errorStatus: () => t('suggest.failed'),
  })

  plugin.marks(notes, {
    rect: (n) => n.rect,
    label: (n) => t('note.label', { text: n.text }),
    card: (n) => ({
      title: () => t('note.title'),
      actions: [{ label: () => t('note.dismiss'), run: () => notes.remove(n.id) }],
    }),
  })
})
```

A card's `actions` is an array of `{ label, run }`, so each label can be a function too. `en` is the default set and the shape a translation follows.

## Serving Inkbar's files

Inkbar loads its own files at runtime: the engine's binary and worker, fallback fonts for text a file does not embed, and the sandbox that runs a form's scripts. It loads them from URLs you pass as the `assets` option. The option has no default, because the right URLs depend on how you deploy your app.

Opening a file loads about 735 KB of JavaScript (240 KB gzipped), the engine's worker included, and the engine's 7.1 MB binary (3.0 MB gzipped). A font is fetched only when a page needs it, and the sandbox only when a file has scripts.

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

In development the plugin serves the files from `node_modules`. In a build it copies them into `<outDir>/inkbar/<version>/`, where `<version>` is the installed `@inkbar/core` version, so a file a browser has cached is never served for a later release. The URLs respect your `base`. A `base` on another origin, such as a CDN, works when that origin sends CORS headers for the files (see [Without Vite](#without-vite)). With a relative `base` such as `./`, the plugin resolves the URLs at runtime from the location of your bundle, so the build works from any path. Pass `inkbar({ assetsDir: 'pdf' })` to use a different directory name in place of `inkbar`.

For TypeScript, reference the module declaration once, for example in `env.d.ts`:

```ts
/// <reference types="@inkbar/core/vite/client" />
```

### Without Vite

Copy these files to a path your server exposes. Take each from the package `@inkbar/core` depends on, at the version it installs; a package manager that does not hoist dependencies, such as pnpm, keeps those packages beside `@inkbar/core` rather than at the top of `node_modules`.

| File                                                                                                                                                         | From             | Copy to    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ---------- |
| `dist/inkbar-pdfium.wasm`                                                                                                                                    | `@inkbar/engine` | `./`       |
| `dist/worker.mjs`                                                                                                                                            | `@inkbar/engine` | `./`       |
| `files/NotoSans-Regular.ttf`, `files/NotoSansJP-Regular.otf`, `files/NotoSansKR-Regular.otf`, `files/NotoSansSC-Regular.otf`, `files/NotoSansTC-Regular.otf` | `@inkbar/fonts`  | `fonts/`   |
| `wasm/quickjs-eval.js`, `wasm/quickjs-eval.wasm`                                                                                                             | `pdfjs-dist`     | `sandbox/` |

Put them under a directory named for the installed `@inkbar/core` version, as the plugin does, so a cached file is never stale after an upgrade. `import { version } from '@inkbar/core'` gives that version, and so does the `version` field of the installed package's `package.json`. Serve `worker.mjs` with a JavaScript MIME type, such as `text/javascript`: a browser refuses to start a module worker from a script served as anything else. Then pass their URLs:

```ts
const base = '/inkbar/<version>/' // the installed @inkbar/core version

const assets = {
  engine: `${base}inkbar-pdfium.wasm`,
  worker: `${base}worker.mjs`,
  fonts: `${base}fonts/`,
  sandbox: `${base}sandbox/`,
}
```

- `engine` is the URL of `inkbar-pdfium.wasm`.
- `worker` is the URL of `worker.mjs`.
- `fonts` is the URL of the directory holding the five fonts. Pass one URL per font instead, as `{ default, japanese, 'simplified-chinese', 'traditional-chinese', korean }`, to name each file yourself or to leave some out. Pass `false` for no fallback fonts: Latin text in the standard fonts still draws, but Chinese, Japanese, Korean, Cyrillic or Greek text in a font the file does not embed draws wrong or not at all. Each Chinese, Japanese or Korean font is 4 to 8 MB.
- `sandbox` is the URL of the directory holding `quickjs-eval.js` and `quickjs-eval.wasm`.

A key that is missing or of the wrong type fails the open with `AssetConfigMissing`, and `details.key` names it. When the engine's binary or worker cannot be fetched or started, the open fails with `AssetLoadFailed`. A font that cannot be fetched is reported with `console.warn`, and its text draws with a substitute. When the sandbox cannot be loaded, the form stays fillable and its scripts do not run: the viewer's `onError` hears a `FormScriptError`.

The files may be on another origin than the page, such as a CDN, when that origin sends CORS headers (`Access-Control-Allow-Origin`) for them. A browser does not start a worker from another origin's script, so the engine then starts it from a small `blob:` module of the page's own that imports `worker.mjs`.

Under a content security policy, opening a file needs these directives:

- `script-src 'wasm-unsafe-eval'`: the engine compiles its binary with WebAssembly, and so does the sandbox that runs a form's scripts, on the page. `script-src` also allows the origin of the `sandbox` directory, since the page imports `quickjs-eval.js` from it.
- `worker-src` allowing the URL of `worker.mjs`: `'self'` when it is on the page's origin. When it is on another origin, `worker-src` needs `blob:`, and the worker then runs under the page's policy, so `script-src` also allows that origin.
- `connect-src` allowing the origin the files are on, when it is not the page's: the engine fetches its binary and fonts, and the sandbox its binary.

A worker started from its own URL runs under the policy its server sends with `worker.mjs`, so that response needs `script-src 'wasm-unsafe-eval'` and the `connect-src` as well.

In Node, `engine` may be a file path or a `file:` URL, and `worker` is ignored, since the engine runs in the calling thread. Form scripts do not run in Node.

Each file keeps the licence of its package: the engine's binary is PDFium and the libraries linked into it, listed in `dist/THIRD-PARTY-NOTICES` of `@inkbar/engine`; the fonts are under the SIL Open Font License, in `OFL.txt` of `@inkbar/fonts`; and the sandbox files come from `pdfjs-dist`, which is under the Apache License 2.0 (in its `LICENSE`). They also contain QuickJS (MIT licence, Fabrice Bellard and Charlie Gordon), built by Mozilla's `pdf.js.quickjs` (MIT licence), and `pdfjs-dist` carries neither notice, so `@inkbar/core` ships both: `licences/quickjs.txt` and `licences/pdfjs-quickjs.txt` in the installed `@inkbar/core` package. The Vite plugin copies each of these beside the files it covers, as `THIRD-PARTY-NOTICES`, `fonts/OFL.txt`, `sandbox/LICENSE`, `sandbox/LICENSE-quickjs` and `sandbox/LICENSE-pdfjs-quickjs`; copy them the same way when you copy the files by hand.

## Licence

[MIT](https://github.com/inkbar/inkbar/blob/main/LICENSE). From the team behind [Redactr](https://redactr.io).
