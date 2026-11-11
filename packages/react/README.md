<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-dark.svg">
    <img src="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-light.svg" alt="Inkbar" width="72" height="72">
  </picture>
</p>

<h1 align="center">@inkbar/react</h1>

<p align="center">
  A PDF viewer and editor for React 19. No licence fee.
</p>

<p align="center">
  <a href="https://inkbar.dev">Website</a> ·
  <a href="https://inkbar.dev/docs/">Docs</a> ·
  <a href="https://sandbox.inkbar.dev">Sandbox</a> ·
  <a href="https://github.com/inkbar/inkbar">GitHub</a>
</p>

---

Drop a PDF viewer into your React app and let people highlight text, leave notes with replies and redact. `@inkbar/react` gives you components and hooks to build your own toolbars, plus a popover for comment threads, all styled by `@inkbar/theme`.

Annotations are plain typed objects. Control them from your own state, or let Inkbar hold them with undo and redo.

## Install

```sh
pnpm add @inkbar/react @inkbar/core @inkbar/theme
```

React 19 and React DOM 19 are peer dependencies. Add the Vite plugin from `@inkbar/core/vite` so PDF.js can load its worker and fonts; the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#serving-pdfjs-assets) covers it. The package is marked `'use client'`, so a React Server Components app can import it from a server component.

## Usage

```tsx
import { useState } from 'react'
import {
  InkRoot,
  InkViewport,
  InkToolbar,
  InkToolButton,
  InkToolbarSeparator,
  InkUndo,
  InkRedo,
  InkPrevPage,
  InkPageInput,
  InkPageCount,
  InkNextPage,
  InkZoomSelect,
  InkThreadPopover,
} from '@inkbar/react'
import { highlightTool, noteTool, redactAreaTool } from '@inkbar/core/dom'
import type { Annotation } from '@inkbar/core'
import { assets } from 'virtual:inkbar-assets'
import '@inkbar/theme/theme.css'

const tools = [highlightTool(), redactAreaTool(), noteTool()]

export function Review({
  signedUrl,
  documentId,
}: {
  signedUrl: string
  documentId: string
}) {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  return (
    <InkRoot
      src={{ url: signedUrl, key: documentId }}
      assets={assets}
      tools={tools}
      annotations={annotations}
      onAnnotationsChange={setAnnotations}
      history
    >
      <InkToolbar>
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
        <InkToolButton tool="highlight" />
        <InkToolButton tool="redact-area" />
        <InkToolButton tool="note" />
        <InkToolbarSeparator />
        <InkUndo />
        <InkRedo />
      </InkToolbar>
      <InkViewport />
      <InkToolbar label="Page and zoom">
        <InkPrevPage />
        <InkPageInput />
        <InkPageCount />
        <InkNextPage />
        <InkZoomSelect />
      </InkToolbar>
      <InkThreadPopover />
    </InkRoot>
  )
}
```

`select-text` and `select` are always there. Every other tool is opt-in: pass the ones you offer through `tools`, from the tool factories in `@inkbar/core/dom`, or `allTools()` for all of them. A button for a tool you did not pass renders empty, disabled and hidden from assistive technology, though it still takes up its place in the layout. `InkHighlightMenu`, `InkShapeMenu` and `InkSignatureMenu` render nothing without their tool. Each logs an `InkError('UnknownTool')` to the console once. If the active tool leaves `tools`, the viewer switches to `select-text` and reports it through `onToolChange`.

Each control is a separate component, so put them in any order or leave some out. Buttons show icons from `@inkbar/icons`. Pass your own as `children` to replace one, and use `InkIcon` to put the same icons on your own buttons. For a button of your own, such as `<InkToolbarButton onClick={download}>Download</InkToolbarButton>`, use `InkToolbarButton`: it joins the toolbar's arrow-key focus and looks like the other buttons.

`annotations` with `onAnnotationsChange` makes your list the source of truth. Leave them off and Inkbar keeps the state itself, with undo and redo. The example passes `history` so that `InkUndo` and `InkRedo` work with your list; see below.

`InkRoot` takes a few more props. `password` opens an encrypted file. `storage` sets what the viewer keeps between visits (see [Storage](#storage)). `defaults` sets the colour defaults for new annotations. `fonts` sets the font families the text style menu offers. `decorateAnnotation` adds `data-*` attributes, classes and a screen-reader description to each annotation's element. `page` with `onPageChange`, `zoom` with `onZoomChange` and `tool` with `onToolChange` control those values from your own state. `onChange` gets each annotation change. `onError` hears open failures, form script errors and refused signatures, and `onActivate` gets the id of an activated annotation. `children` can be a function of `{ status, document }`.

## Viewport

`InkViewport` takes `mode` and `rotation`, plus `gap` (CSS px between pages, 16 by default), `buffer` (pages kept mounted either side of the visible ones, 2 by default) and `pinchZoom` (`true` by default; `false` leaves pinches to the browser, which zooms the whole page). A change to `gap`, `buffer` or `pinchZoom` rebuilds the engine.

On a touch screen, two fingers pinch to zoom the document and scroll it. With `draw`, `sketch`, `shape`, `redact-area` and `freetext`, one finger draws; a finger tap draws nothing, and a pen that lands while a palm rests on the screen takes over. A shape, area redaction or text box gives one-finger scrolling back once it has made something.

## Style menus

`InkColorMenu` (its `property` is `border`, `fill` or `text`), `InkLineStyleMenu` (weight, dashes, arrowheads) and `InkTextStyleMenu` (font, size, colour, bold, italic, underline, alignment) edit the selection, or the active tool's style when nothing is selected. They disable when nothing supports their properties. `InkShapeMenu` is a split button for the `shape` tool and renders nothing unless `shapeTool` is in `tools`.

## Controlled mode

With `annotations` and `onAnnotationsChange`, Inkbar proposes each change through `onAnnotationsChange` and shows whatever list you pass back. To change annotations yourself, set a new array: `setAnnotations([...annotations, next])`. In-place mutation (`push`, `splice`, editing an item) is not observed, so the viewer never sees it.

Undo and redo are off in controlled mode unless you pass `history`. Inkbar then keeps a stack of your list's past values and applies undo and redo through `onAnnotationsChange`. Every change to the list is a step, including the list you load from your server when the document opens. Clear the history once that load has rendered, so the first undo does not empty the list:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { InkRootHandle } from '@inkbar/react'
import type { InkDocument } from '@inkbar/core'

const root = useRef<InkRootHandle>(null)
const [loaded, setLoaded] = useState<string | null>(null)

async function onReady(doc: InkDocument) {
  setAnnotations(await loadAnnotations(doc.key))
  setLoaded(doc.key)
}

// Runs after InkRoot has seen the loaded list.
useEffect(() => {
  if (loaded) root.current?.history.clear()
}, [loaded])

<InkRoot
  src={{ url: signedUrl, key: documentId }}
  assets={assets}
  annotations={annotations}
  onAnnotationsChange={setAnnotations}
  history
  onReady={onReady}
  ref={root}
>
  …
</InkRoot>
```

Inside `InkRoot`, `useHistory()` returns the same object. Its `batch(fn)` runs `fn` and records what it changes as one undo step. With `history` on a controlled list, you still get one `onAnnotationsChange` call per add. The step lands when the current task ends, and `canUndo` updates then. Any other change you apply to the list in that window joins the step. In both modes, `fn` must be synchronous.

`key` identifies the document. Reuse the same key when only the signed URL changes and the document is not reloaded.

## Forms

`InkViewport` fills the PDF's form fields and runs the form's scripts. `useForm()` returns the fields, their values, and `set` and `reset`. Pass `fields` with `onFieldsChange` to hold the values in your own state. The form never submits, opens a link, sends mail or prints: `onAction` hands each request to you; so does a link to a URL. `onFormAction` still works until 0.13.0. `formHighlight={false}` turns off the field tint, and a change applies to the open document in place.

The [forms guide](https://inkbar.dev/docs/guides/forms/) covers controlled fields, form actions, scripts, signature fields and saving values as Gloss.

## Thread popover

`InkThreadPopover` opens the comment thread of the activated note or text markup (a highlight, underline, strikeout or squiggly). A new note or highlight has no text yet, so the form first writes its own `contents` (labelled "Comment"); after that it adds replies. A highlight with a comment shows a small marker at its end. Replies show in the thread only; the page draws just the note or highlight they answer.

A root note with no text and no replies is removed when its popover closes, or when activation moves to another annotation, so abandoned notes do not stay on the page. A highlight stays: the mark is the point. Locked annotations are never removed. If you add notes yourself (`add({ type: 'text', ... })`), give them `contents`, or they will be removed the first time someone opens and closes them.

The highlight tool leaves `contents` free for the comment. `doc.text(page)` returns the page's text items; match the markup's `quads` against them to get the marked text. `InkHighlightMenu` is a split button for the tool: it picks the markup kind and its colour.

## Signatures

`InkSignatureMenu` lists saved signatures, picks one for the `signature` tool, removes them, and opens `InkSignatureDialog` to draw, type or upload a new one. The menu needs `signatureTool()` in `tools`. The dialog and signature form fields work without it; the dialog then only saves the signature. These are marks on the page, not cryptographic signatures. `InkRoot` keeps them in its `storage` under the key `signatures`, so without a store they last until reload. A `signatures` store of your own still works and wins over `storage` until 0.13.0, which removes it. `signatureFonts` lists the handwriting fonts the Type tab offers; load them with `@font-face`. A placed signature keeps its aspect ratio when resized.

To open the dialog from your own button, render `<InkSignatureDialog open={open} onOpenChange={setOpen} />`. `onSave` receives the new template, and `select={false}` stops it selecting the template for the `signature` tool. `InkSignatureMenu` and the dialog take `fonts` to override `signatureFonts`.

## Storage

`InkRoot` keeps a few small things between visits: saved signatures, sidebar widths and plugin settings. Pass `storage` to choose where. `createLocalStorage()` from `@inkbar/core` keeps them in `localStorage`, and any `InkStorage` works, including an async one that talks to your server. The default is `createMemoryStorage()`, which forgets everything on reload. Inkbar never touches `localStorage`, cookies or the network unless the store you pass does. The root reads `storage` once, when it is created. See the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#storage) for the keys.

```tsx
const storage = createLocalStorage()

<InkRoot src={src} assets={assets} storage={storage}>
```

## Plugins

A plugin from `definePlugin` (in `@inkbar/core/dom`) adds commands, tools, decorations, page layers and its own record stores. Pass plugins to `InkRoot` once: the prop is read when the root mounts. Nothing a plugin registers shows until you place it:

```tsx
<InkRoot src={src} assets={assets} plugins={[suggestions]}>
  <InkToolbar>
    <InkCommand id="sandbox.suggest" />
    <InkToolButton tool="sandbox.stamp" />
  </InkToolbar>
  <InkViewport />
</InkRoot>
```

`InkCommand` is a button named by the command's label, disabled while the command is, and its status in a live region beside it. While the command runs, the button keeps focus and has `aria-busy` and `aria-disabled`, and pressing it does nothing. It shows the command's icon, or its label as text when the command has no icon. To build your own, `useCommand(id)` returns `run`, `enabled`, `busy`, `status`, `label` and `icon`. Plugins are set up once `InkRoot` has mounted in the browser, never on the server. Until then the command is disabled and has no label, and `InkCommand` keeps its button out of the accessibility tree (`aria-hidden`). An id no plugin registered stays that way: `InkCommand` and `useCommand` log an `InkError('UnknownCommand')` to the console once, naming the id and the registered ones, and nothing throws. `InkToolButton` takes a plugin tool's own label and icon.

Plugin stores undo with annotations. In controlled mode with `history`, each undo step also snapshots the plugin stores, so accepting something and undoing it restores both.

## Search

`InkFindBar` is the find bar and `InkSearchButton` opens it. Place the bar anywhere inside `InkRoot`, once `InkViewport` is there; Ctrl/Cmd+F opens it while it is mounted. `useSearch()` returns the search `state` and its actions (`open(query?)`, `setQuery`, `setMatchCase`, `next`, `previous`, `select(index)`, `close`) for your own control. See the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#search) for the API.

The bar handles Escape itself and stops it there, so an `onKeyDown` you pass to `InkFindBar` never sees Escape.

## Sidebars

`InkSidebar` holds `InkPanel`s and places nothing itself: put it beside `InkViewport` with your own flex or grid layout. Each panel has an `id`, a `label`, an optional `icon` (an `IconNode` from `@inkbar/icons`) and an optional `badge`, a number or short string hidden when empty or 0. Its children are the panel's content, your own component or one of Inkbar's.

```tsx
<InkRoot src={src} assets={assets}>
  <div className="app">
    <InkSidebar side="left" layout="rail" open={open} onOpenChange={setOpen}>
      <InkPanel id="pages" label="Pages" icon={Square}>
        <InkThumbnails />
      </InkPanel>
      <InkPanel id="notes" label="Notes" icon={MessageSquare} badge={noteCount}>
        <MyNotes />
      </InkPanel>
    </InkSidebar>
    <InkViewport />
  </div>
</InkRoot>
```

`layout` is `rail` (default: icon buttons beside the document, and activating the open panel's button closes it), `tabs` (labelled tabs, one panel open) or `stack` (a header per panel, any number expanded). `side` (`left` by default) decides which edge the rail and border sit on. `open` is the open panel's id, or `null`, for rail and tabs, and the expanded ids for stack. Pass it with `onOpenChange` to control the sidebar, or pass `defaultOpen` to set only where it starts. With neither, the first panel starts open. When the open panel goes (rendered conditionally), rail and tabs open the first one left and stack drops it, and `onOpenChange` receives the new value. In the rail, the open panel shows its label as a title above its content. `visible` (default `true`) shows or hides the whole sidebar; it keeps the open panel, its content and its scroll for when it shows again. Your code decides when: `visible={hits > 0}` keeps a results sidebar out of the way until a search finds something.

Panels take their place in the order they appear in the DOM, including one rendered later. A closed panel stays mounted and hidden, so its content keeps its state and scroll position, across layout changes too. The keys and ARIA are core's: see the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#sidebars). The sidebar needs no document and works outside `InkRoot`. On the server it renders its frame at its width with the open panel showing, the stack headers and the resize handle; rail and tab buttons follow once it has mounted.

Each sidebar has a resize handle on its inner edge. Drag it, or focus it and use the arrow keys (16px a step), Home and End. Enter or a double-click resets the width. The width starts at `defaultWidth` (320) and stays between `minWidth` (240) and `maxWidth` (480), and never past half of the sidebar's container. Inside `InkRoot` the sidebar saves its width in the root's `storage` under `sidebar.<name>.width`, where `name` defaults to the side; give two sidebars on one side different names. Pass `storage` to the sidebar to use another store, or to save its width outside `InkRoot`. The sidebar reads `storage` and `name` once, when it is created. `width` hands you the width: bind it to a number and update it from `onWidthChange`. The handle then only reports, and the sidebar neither reads nor writes storage.

```tsx
<InkSidebar name="tools" side="right" defaultWidth={360} width={toolsWidth} onWidthChange={setToolsWidth}>
```

## Thumbnails

`InkThumbnail` draws one page (0-based `page`) as a small image, with its annotations and plugin marks. Give it a `width` or a `height` and the other follows the page; with neither it is 120px wide. `annotations={false}` and `marks={false}` leave those out, and `label` replaces its accessible name ("Page 4" for page 3). It is an image with no focus or click behaviour, so wrap it in the control you need, a checkbox label in a dialog for instance.

`InkThumbnails` lists the pages as thumbnails, each a button that scrolls the viewport to its page, with the current page marked `aria-current="page"`. It fills its parent's height and scrolls. `pages` lists the pages to show, in order. The thumbnails fill the list's width less a 16px gutter each side and follow it as it resizes; `width` fixes them at that many pixels instead. `annotations` and `marks` pass to each thumbnail. Only the items near the visible part are mounted. `renderItem` adds to each item after its page number:

```tsx
<InkThumbnails
  renderItem={({ page }) => <span className="page-count">{counts[page]}</span>}
/>
```

An item's height is worked out from its page alone, so position what you add absolutely. What `renderItem` returns renders inside the item's `<button>`: keep it non-interactive, with no links, buttons or inputs. Both need `InkRoot` and render empty on the server.

## Outline and Back

`InkOutline` shows the document's outline as a tree. Clicking an item, or Enter on it, follows it: a destination scrolls there (without changing the zoom), a web address goes to the host as an `open-url` action. The chevron expands and collapses an item without following it. The item the reader has reached is marked `aria-current="location"` and kept in view. It fills its parent's height and scrolls, so put it in a panel:

```tsx
<InkPanel id="outline" label="Outline" icon={List}>
  <InkOutline emptyText="No outline" />
</InkPanel>
```

`emptyText` is shown when the document has no outline. `renderItem`, given the item and `{ current, expanded }`, replaces an item's title. The keys and ARIA are core's, as in the thumbnails. Needs `InkRoot`; the tree renders empty on the server.

`InkBack` and `InkForward` return to where the view was before a jump (a link, an outline item) and undo that. Each is disabled until there is somewhere to go, and takes `asChild`. Put them in an `InkToolbar`.

## Record lists

`InkRecordList` lists a plugin's records as cards, the same cards their marks open, with the same actions. Name the records `<plugin>.<name>`:

```tsx
<InkPanel id="suggestions" label="Suggestions" icon={MessageSquare} badge={count}>
  <InkRecordList
    records="review.suggestions"
    onCountChange={setCount}
    empty="No suggestions left."
  />
</InkPanel>
```

The list and the marks share one selection: choosing a card selects its mark and scrolls the viewer there, and activating a mark selects its card. Each action runs in one undo step. `card`, `where` and `sort` replace the marks' card, filter and reading order. A new function rebuilds the list, so wrap them in `useCallback` or define them outside the component, never inline. `onCountChange` gets the number listed whenever it changes, ready for a panel badge. `empty` replaces "Nothing here yet.", and `empty={null}` shows nothing. To list something of your own, pass a `source` (a `RecordListSource`, as core's `recordsSource` and `searchSource` build) in place of `records`: it gets the same cards, keys and selection. With both, `source` wins.

`InkSearchResults` is the same list over the document search: one card per hit, titled with its page ("Page 2"), with its place on that page ("Match 3") and the text around it. Choosing a card makes its hit current, as the find bar's next and previous do. It has its own field, labelled "Find in document", above the cards and the find bar's match count in a footer below them; `field={false}` leaves the field out when a find bar is on the page. Field and find bar share the search state, so they never disagree.

To build your own, `useRecords<T>(name)` returns the live `records` and the `handle` to read and write them, each write one undo step, and `useRecordSelection(name)` returns `selected` and `select(id | null)`. Both need `InkRoot`. Plugins are set up once it has mounted, so until then `handle` is null, `records` is empty and nothing is selected. Both lists fill their parent's height and render empty on the server. The keys, focus and announcements are core's: see the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#record-lists).

## Custom rendering

Slots are render props. `InkViewport` takes `loading`, `empty`, `error`, `renderAnnotation` and `renderPageError`; `InkThreadPopover` takes a function as `children`; `InkToolButton` takes a node or a function of `{ active, label }`; `InkCommand` a node or a function of `{ label, busy }`; `InkThumbnails` and `InkOutline` take `renderItem`; `InkRecordList` takes `empty`. The props each receives are typed as `AnnotationSlotProps` and `ThreadPopoverSlotProps`, the same types the Vue package exports.

`InkDownloadButton` and `InkPrintButton` download and print the open PDF; `filename` names the download (the opened `File`'s name, else the URL's last segment, else `document.pdf`; `.pdf` is added to a name without it). Printing loads the file into a hidden frame and opens the browser's print dialog for it; on iOS the PDF opens in a new tab instead. Until saving into the PDF ships, both give the file as it was opened, without this session's annotations.

`InkRoot`, `InkToolbar`, `InkToolButton`, `InkToolbarButton`, `InkSearchButton`, `InkCommand`, `InkUndo`, `InkRedo`, `InkDownloadButton`, `InkPrintButton`, `InkPrevPage`, `InkNextPage`, `InkBack`, `InkForward`, `InkZoomIn` and `InkZoomOut` take `asChild` to render your own element in place of theirs, such as a button from your design system. Pass that element as the only child. The control keeps its behaviour and accessible name.

## Keyboard

The scroll area takes focus. From there:

- With the `highlight` or `redact-area` tool active, `Enter` turns the text selection into a mark.
- With the `note` tool active, `Enter` places a note at the centre of the current page and opens it.
- With the `signature` tool active, `Enter` places the chosen signature at the centre of the current page.
- `Ctrl` or `Cmd` + `Z` undoes. `Ctrl` or `Cmd` + `Shift` + `Z`, or `Ctrl` + `Y`, redoes. `Ctrl` and `Cmd` both work on every platform. The keys do what `InkUndo` and `InkRedo` do, from anywhere in `InkRoot`, toolbars included, and act only while that button is enabled. In a text field or editable content the keys stay with the element, so a field keeps its own text undo. In a `<select>` they are left to the browser, which does nothing with them.
- `Ctrl` or `Cmd` + `P` prints the PDF and `Ctrl` or `Cmd` + `S` downloads it, as `InkPrintButton` and `InkDownloadButton` do, from anywhere in `InkRoot` once the document is ready. Outside `InkRoot` the browser keeps them.

On a focused annotation:

- `Enter` or `Space` selects and activates it. A note or text markup opens its thread; other types are only selected. `Enter` on an editable text box opens its editor instead.
- `ArrowUp` and `ArrowDown` move to the previous or next annotation on the page.
- `Shift` + arrow moves it by 1 pt, or by 10 pt with `Alt` as well.
- `Ctrl` or `Cmd` + `Shift` + arrow resizes an area redaction, text box or shape.
- `Delete` or `Backspace` removes it.
- `Escape` clears the selection.

The full table, with the zoom and page keys, is in the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#tools-and-keyboard).

## Styling

Components carry state on data attributes, for example `[data-annotation][data-state="selected"]` and `[data-tool="highlight"][data-state="on"]`. `@inkbar/theme` gives a default look. Your own CSS overrides it without `!important`. `InkRoot`, `InkViewport`, `InkToolbar` and the toolbar controls accept `className`.

## Hooks

`useDocument`, `useAnnotations`, `useTool`, `useToolOptions`, `useToolStyle`, `useSelection`, `useZoom`, `usePage`, `useHistory`, `useSearch`, `useForm`, `useEmbedded`, `useCommand`, `useRecords` and `useRecordSelection` read the state of the nearest `InkRoot`. Build your own toolbar or side panel from them. `useToolOptions` reads and sets a tool's options, such as the shape kind; they last as long as `InkRoot`. The tool style that `useToolStyle` reads and sets (colours, line style, text style) belongs to the document: opening another one starts again from the theme's defaults.

## Licence

[MIT](https://github.com/inkbar/inkbar/blob/main/LICENSE). From the team behind [Redactr](https://redactr.io).
