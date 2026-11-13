<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-dark.svg">
    <img src="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-light.svg" alt="Inkbar" width="72" height="72">
  </picture>
</p>

<h1 align="center">@inkbar/svelte</h1>

<p align="center">
  A PDF viewer and editor for Svelte 5. No licence fee.
</p>

<p align="center">
  <a href="https://inkbar.dev">Website</a> ·
  <a href="https://inkbar.dev/docs/">Docs</a> ·
  <a href="https://sandbox.inkbar.dev">Sandbox</a> ·
  <a href="https://github.com/inkbar/inkbar">GitHub</a>
</p>

---

Drop a PDF viewer into your Svelte app and let people highlight text, leave notes with replies and redact. `@inkbar/svelte` gives you components to build your own toolbars, a popover for comment threads, and hooks for anything else. `@inkbar/theme` styles them all.

Annotations are plain typed objects. Bind them with `bind:annotations` to keep them in your own state, or let Inkbar hold them with undo and redo.

## Install

```sh
pnpm add @inkbar/svelte @inkbar/core @inkbar/theme
```

`@inkbar/core` (installed above, at the same version) and Svelte 5.46.4 or later are peer dependencies. Add the Vite plugin from `@inkbar/core/vite` so PDF.js can load its worker and fonts; the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#serving-pdfjs-assets) covers it. The package ships `.svelte` sources, so your bundler compiles them for your target, including the server.

## Usage

```svelte
<script lang="ts">
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
    InkZoomOut,
    InkZoomSelect,
    InkZoomIn,
    InkThreadPopover,
  } from '@inkbar/svelte'
  import { highlightTool, noteTool, redactAreaTool } from '@inkbar/core/dom'
  import type { Annotation } from '@inkbar/core'
  import { assets } from 'virtual:inkbar-assets'
  import '@inkbar/theme/theme.css'

  let { signedUrl, documentId }: { signedUrl: string; documentId: string } = $props()

  let annotations = $state.raw<Annotation[]>([])
  const tools = [highlightTool(), redactAreaTool(), noteTool()]
</script>

<InkRoot src={{ url: signedUrl, key: documentId }} {assets} {tools} bind:annotations history={true}>
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
    <InkZoomOut />
    <InkZoomSelect />
    <InkZoomIn />
  </InkToolbar>
  <InkThreadPopover />
</InkRoot>
```

`select-text` and `select` are always there. Every other tool is opt-in: pass the ones you offer through `tools`, from the tool factories in `@inkbar/core/dom`, or `allTools()` for all of them. A button for a tool you did not pass renders empty, disabled and `aria-hidden`, the highlight, shape and signature menus render nothing, and each logs an `InkError('UnknownTool')` to the console once. If the active tool leaves `tools`, the viewer switches to `select-text` and reports it through `onToolChange`.

Each toolbar control is a component, so keep the ones you need and put them where you like. Buttons show icons from `@inkbar/icons`. Pass your own as `children` to replace one, and use `InkIcon` to put the same icons on your own buttons. For a button of your own, such as `<InkToolbarButton onclick={download}>Download</InkToolbarButton>`, use `InkToolbarButton`: it joins the toolbar's arrow-key focus and looks like the other buttons. `bind:annotations` makes your list the source of truth, and `history={true}` keeps undo and redo working with it. Leave the binding off and Inkbar keeps the state itself, with undo and redo on by default.

## Controlled mode

With `bind:annotations`, Inkbar proposes each change by writing the binding and shows whatever list it holds. To change annotations yourself, replace the array: `annotations = [...annotations, next]`. In-place mutation (`push`, `splice`, editing an item) is not observed, so the viewer never sees it. Declare the list with `$state.raw`, since Inkbar replaces it whole.

To decide on each proposal before it applies, use a function binding. The setter receives the proposed list; apply it, change it or drop it:

```svelte
<InkRoot
  src={{ url: signedUrl, key: documentId }}
  {assets}
  bind:annotations={() => annotations, (next) => (annotations = next.filter(allowed))}
>
  <InkViewport />
</InkRoot>
```

`onAnnotationsChange` fires alongside the binding, and `onChange` carries the change itself. An `annotations` prop passed without a binding is overridden inside the component as proposals arrive, so bind it to keep control.

Undo and redo are off in controlled mode unless you pass `history={true}`. Inkbar then keeps a stack of your list's past values and applies undo and redo through the binding. Every change to the list is a step, including the list you load from your server when the document opens. Clear the history once that load has reached the viewer, so the first undo does not empty the list:

```svelte
<script lang="ts">
  import { tick } from 'svelte'
  import { InkRoot, InkViewport } from '@inkbar/svelte'
  import type { InkRootHandle } from '@inkbar/svelte'
  import type { Annotation, InkDocument } from '@inkbar/core'
  import { assets } from 'virtual:inkbar-assets'

  let { signedUrl, documentId }: { signedUrl: string; documentId: string } = $props()

  let annotations = $state.raw<Annotation[]>([])
  let root = $state<InkRootHandle | undefined>()

  async function onReady(doc: InkDocument) {
    annotations = await loadAnnotations(doc.key)
    await tick()
    root?.history.clear()
  }
</script>

<InkRoot
  bind:this={root}
  bind:annotations
  history={true}
  src={{ url: signedUrl, key: documentId }}
  {assets}
  {onReady}
>
  <InkViewport />
</InkRoot>
```

Inside `InkRoot`, `useHistory()` returns the same object. Its `batch(fn)` runs `fn` and records what it changes as one undo step. With `history={true}` on a controlled list, you still get one write to `bind:annotations` per add. The step lands when the current task ends, and `canUndo` updates then. Any other change you apply to the list in that window joins the step. In both modes, `fn` must be synchronous. The instance also exposes `getDocument()` and `getStatus()`, and `bind:ref` gives you the root element.

`key` identifies the document. Reuse the same key when only the signed URL changes and the document is not reloaded.

`InkRoot` takes a few more options. `password` opens an encrypted PDF (see [Locked files](#locked-files)). `passwordPrompt` (on by default) asks the reader for a locked file's password. `storage` sets what the viewer keeps between visits (see [Storage](#storage)). `minDocumentWidth` sets how narrow the document may get before a rail sidebar's panel floats over it (see [Sidebars](#sidebars)). `defaults` sets annotation colours; without it the theme's CSS variables apply. `fonts` sets the families the text style menu offers. `decorateAnnotation` adds attributes, classes and a screen-reader description to each annotation. `bind:page` and `bind:zoom` (or `onPageChange` and `onZoomChange`) follow and drive the viewport, and `bind:tool` (or `onToolChange`) does the same for the active tool. `onError` hears failed opens, form script errors and refused signings. `onActivate` hears the id of each activated annotation. `onFieldsChange` hears form value changes.

## Viewport

`InkViewport` takes `mode`, `rotation`, `gap` (CSS pixels between pages, default 16), `buffer` (pages kept mounted either side of the visible ones, default 2) and `pinchZoom` (default `true`; `false` leaves pinches to the browser, which zooms the whole page). A change to `gap`, `buffer` or `pinchZoom` rebuilds the engine.

On a touch screen, two fingers pinch to zoom the document and scroll it. With `draw`, `sketch`, `shape`, `redact-area` and `freetext`, one finger draws; a finger tap draws nothing, and a pen that lands while a palm rests on the screen takes over. A shape, area redaction or text box gives one-finger scrolling back once it has made something.

## Locked files

When a file needs a password, the viewer asks for it in a dialog. `InkViewport` mounts `InkPasswordDialog` for you. A wrong password keeps the dialog open with a message. Cancel closes it and leaves a panel with an "Enter password" button. While the file is locked, `status` is `{ state: 'locked', incorrect }` and `data-state` reads `locked`. `onError` still fires once for each failed open.

Inkbar uses the typed password for that one load, then drops it. A `password` you pass still applies first; if it's wrong, the dialog opens with the message showing. Pass `passwordPrompt={false}` to keep the plain `PasswordRequired` error and handle it yourself.

To replace the panel that shows while the dialog is closed, pass a `locked` snippet to `InkViewport`. It receives `{ incorrect, promptPassword }`, and `promptPassword` reopens the dialog.

```svelte
<InkViewport>
  {#snippet locked({ promptPassword })}
    <button onclick={promptPassword}>Unlock this file</button>
  {/snippet}
</InkViewport>
```

To build your own flow, use the exported `InkPasswordDialog`. It takes `open` (bindable), `onOpenChange`, `incorrect`, `pending` and `onSubmit`, which gets the password. Inside `InkRoot`, the context's `passwordPrompt` is the controller that drives it, or `null` when the prompt is off.

## Forms

`InkViewport` fills the PDF's form fields and runs the form's scripts. `useForm()` returns the fields, their values, and `set` and `reset`. Use `bind:fields` to hold the values in your own state. The form never submits, opens a link, sends mail or prints: `onaction` hands each request to you; so does a link to a URL. `formHighlight={false}` turns off the field tint, and a change applies to the open document in place.

The [forms guide](https://inkbar.dev/docs/guides/forms/) covers controlled fields, form actions, scripts, signature fields and saving values as Gloss.

## Thread popover

`InkThreadPopover` opens the comment thread of the activated note or text markup (a highlight, underline, strikeout or squiggly). A new note or highlight has no text yet, so the form first writes its own `contents` (labelled "Comment"); after that it adds replies. A highlight with a comment shows a small marker at its end. Replies show in the thread only; the page draws just the note or highlight they answer.

A root note with no text and no replies is removed when its popover closes, or when activation moves to another annotation, so abandoned notes do not stay on the page. A highlight stays: the mark is the point. Locked annotations are never removed. If you add notes yourself (`add({ type: 'text', ... })`), give them `contents`, or they will be removed the first time someone opens and closes them.

The highlight tool leaves `contents` free for the comment. `doc.text(page)` returns the page's text items; match the markup's `quads` against them to get the marked text. `InkHighlightMenu` is a split button for the tool: it picks the markup kind and its colour.

## Style menus

`InkColorMenu` (`property="border"`, `"fill"` or `"text"`), `InkLineStyleMenu` (weight, dashes, arrowheads) and `InkTextStyleMenu` (font, size, colour, bold, italic, underline, alignment) edit the selection, or the active tool's style when nothing is selected. A menu disables when nothing supports its properties. `InkShapeMenu` is a split button for the `shape` tool and renders nothing unless `shapeTool` is in `tools`. `fonts` on `InkRoot` sets the families the text style menu offers.

## Signatures

`InkSignatureMenu` lists saved signatures, picks one for the `signature` tool, removes them, and opens `InkSignatureDialog` to draw, type or upload a new one. The menu needs `signatureTool()` in `tools`. The dialog and signature form fields work without it; the dialog then only saves the signature. These are marks on the page, not cryptographic signatures. `InkRoot` keeps them in its `storage` under the key `signatures`, so without a store they last until reload. `signatureFonts` lists the handwriting fonts the Type tab offers; load them with `@font-face`. A placed signature keeps its aspect ratio when resized.

## Storage

`InkRoot` keeps a few small things between visits: saved signatures, sidebar widths and plugin settings. Pass `storage` to choose where. `createLocalStorage()` from `@inkbar/core` keeps them in `localStorage`, and any `InkStorage` works, including an async one that talks to your server. The default is `createMemoryStorage()`, which forgets everything on reload. Inkbar never touches `localStorage`, cookies or the network unless the store you pass does. The root reads `storage` once, when it is created. See the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#storage) for the keys.

```svelte
<script lang="ts">
  import { createLocalStorage } from '@inkbar/core'
  const storage = createLocalStorage()
</script>

<InkRoot {src} {assets} {storage}>
```

## Plugins

A plugin from `definePlugin` (in `@inkbar/core/dom`) adds commands, tools, decorations, page layers and its own record stores. Pass plugins to `InkRoot` once: the prop is read when the root is created. Nothing a plugin registers shows until you place it:

```svelte
<InkRoot {src} {assets} plugins={[suggestions]}>
  <InkToolbar>
    <InkCommand id="sandbox.suggest" />
    <InkToolButton tool="sandbox.stamp" />
  </InkToolbar>
  <InkViewport />
</InkRoot>
```

`InkCommand` is a button named by the command's label, disabled while the command is, and its status in a live region beside it. While the command runs, the button keeps focus and has `aria-busy` and `aria-disabled`, and pressing it does nothing. It shows the command's icon, or its label as text when the command has no icon. To build your own, `useCommand(id)` returns `run`, `enabled`, `busy`, `status`, `label` and `icon`. Plugins are set up once `InkRoot` has mounted in the browser, never on the server. Until then the command is disabled and has no label, and `InkCommand` keeps its button out of the accessibility tree (`aria-hidden`). Read `label` and `icon` off the handle, as you read `enabled`, so they fill in then. An id no plugin registered stays that way: `InkCommand` and `useCommand` log an `InkError('UnknownCommand')` to the console once, naming the id and the registered ones, and nothing throws. `InkToolButton` takes a plugin tool's own label and icon.

Plugin stores undo with annotations. In controlled mode with `history`, each undo step also snapshots the plugin stores, so accepting something and undoing it restores both.

## Search

`InkFindBar` is the find bar and `InkSearchButton` opens it. Place the bar anywhere inside `InkRoot`, once `InkViewport` is there; Ctrl/Cmd+F opens it while it is mounted. `useSearch()` returns the search `state` and its actions (`open(query?)`, `setQuery`, `setMatchCase`, `next`, `previous`, `select`, `close`) for your own control. See the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#search) for the API.

The bar handles Escape itself and stops it there, so an `onkeydown` you pass to `InkFindBar` never sees Escape.

## Sidebars

`InkSidebar` holds `InkPanel`s and places nothing itself: put it beside `InkViewport` with your own flex or grid layout. Each panel has an `id`, a `label`, an optional `icon` (an `IconNode` from `@inkbar/icons`) and an optional `badge`, a number or short string hidden when empty or 0. Its children are the panel's content, your own component or one of Inkbar's.

```svelte
<script lang="ts">
  import { Square, MessageSquare } from '@inkbar/icons'
</script>

<InkRoot {src} {assets}>
  <div class="app">
    <InkSidebar side="left" layout="rail" bind:open>
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

`layout` is `rail` (default: icon buttons beside the document, and activating the open panel's button closes it), `tabs` (labelled tabs, one panel open) or `stack` (a header per panel, any number expanded). `side` (`left` by default) decides which edge the rail and border sit on. `bind:open` is the open panel's id, or `null`, for rail and tabs, and the expanded ids for stack. Left out, the first panel starts open, unless the sidebar has no room (see below). When the open panel goes (an `{#if}`), rail and tabs open the first one left and stack drops it, and the bound `open` receives the new value. In the rail, the open panel shows its label as a title above its content. `visible` (default `true`) shows or hides the whole sidebar; it keeps the open panel, its content and its scroll for when it shows again. Your code decides when: `visible={hits > 0}` keeps a results sidebar out of the way until a search finds something.

Panels take their place in the order they appear in the markup, including one added later with `{#if}`. A closed panel stays mounted and hidden, so its content keeps its state and scroll position, across layout changes too. The keys and ARIA are core's: see the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#sidebars). The sidebar needs no document and works outside `InkRoot`. On the server it renders its frame at its width with the open panel showing, the stack headers and the resize handle; rail and tab buttons follow once it has mounted.

Each sidebar has a resize handle on its inner edge. Drag it, or focus it and use the arrow keys (16px a step), Home and End. Enter or a double-click resets the width. The width starts at `defaultWidth` (320) and stays between `minWidth` (240) and `maxWidth` (480). The handle is labelled "Resize left sidebar" or "Resize right sidebar"; pass `handleLabel` to name it yourself. The sidebar sets `--ink-sidebar-width` inline, so a CSS override of it no longer applies. Pass `defaultWidth` instead. Inside `InkRoot` the sidebar saves its width in the root's `storage` under `sidebar.<name>.width`, where `name` defaults to the side; give two sidebars on one side different names. Pass `storage` to the sidebar to use another store, or to save its width outside `InkRoot`. The sidebar reads `storage`, `name`, `minDocumentWidth` and `handleLabel` once, when it is created. To control the width, bind `width` to a number: the handle then only updates the binding, and the sidebar neither reads nor writes storage. Bind it to a value that starts `undefined` and you only receive the width; the sidebar keeps saving it.

```svelte
<InkSidebar name="tools" side="right" defaultWidth={360} bind:width={toolsWidth}>
```

Sidebars that share a parent element make room for the document together. While the document beside them would be narrower than `minDocumentWidth` (480 by default), a rail sidebar's open panel floats over the pages like a drawer, and the rail stays in place to close and reopen it. When the parent grows again, the panel goes back beside the document. Tabs and stack sidebars never float: they narrow toward `minWidth` instead. Either way, the saved width and the bound `width` stay the width the reader chose. Set `minDocumentWidth` on `InkRoot` for every sidebar inside it, or on one `InkSidebar`, whose own wins.

A floating panel closes on a tap anywhere else in the parent (the pages, say), on `Escape`, or when the find bar opens. The closing tap does nothing else: no tool draws, no link is followed and no field takes focus. An unbound sidebar with no room when it mounts starts with its panel closed. A bound `open` is never changed for you: a close goes through `bind:open`, and a host that keeps it open keeps the panel floating. On the server the sidebar renders beside the document as usual; floating and starting closed are decided in the browser once it has mounted.

```svelte
<InkRoot {src} {assets} minDocumentWidth={600}>
```

## Thumbnails

`InkThumbnail` draws one page (0-based `page`) as a small image, with its annotations and plugin marks. Give it a `width` or a `height` and the other follows the page; with neither it is 120px wide. `annotations={false}` and `marks={false}` leave those out, and `label` replaces its accessible name ("Page 4" for page 3). It is an image with no focus or click behaviour, so wrap it in the control you need, a checkbox label in a dialog for instance.

`InkThumbnails` lists the pages as thumbnails, each a button that scrolls the viewport to its page, with the current page marked `aria-current="page"`. It fills its parent's height and scrolls. `pages` lists the pages to show, in order. The thumbnails fill the list's width less a 16px gutter each side and follow it as it resizes; `width` fixes them at that many pixels instead. `annotations` and `marks` pass to each thumbnail. Only the items near the visible part are mounted. The `item` snippet adds to each item after its page number:

```svelte
<InkThumbnails>
  {#snippet item({ page, current })}
    <span class="page-count">{counts[page]}</span>
  {/snippet}
</InkThumbnails>
```

An item's height is worked out from its page alone, so position what you add absolutely. The `item` snippet renders inside the item's `<button>`: keep it non-interactive, with no links, buttons or inputs. Both need `InkRoot` and render empty on the server.

## Outline and Back

`InkOutline` shows the document's outline as a tree. Clicking an item, or Enter on it, follows it: a destination scrolls there (without changing the zoom), a web address goes to the host as an `open-url` action. The chevron expands and collapses an item without following it. The item the reader has reached is marked `aria-current="location"` and kept in view. It fills its parent's height and scrolls, so put it in a panel:

```svelte
<InkPanel id="outline" label="Outline" icon={List}>
  <InkOutline emptyText="No outline" />
</InkPanel>
```

`emptyText` is shown when the document has no outline. The `item` snippet, given the item and `{ current, expanded }`, replaces an item's title. The keys and ARIA are core's, as in the thumbnails. Needs `InkRoot`; the tree renders empty on the server.

`InkBack` and `InkForward` return to where the view was before a jump (a link, an outline item) and undo that. Each is disabled until there is somewhere to go, and takes a `child` snippet. Put them in an `InkToolbar`.

## Record lists

`InkRecordList` lists a plugin's records as cards, the same cards their marks open, with the same actions. Name the records `<plugin>.<name>`:

```svelte
<InkPanel id="suggestions" label="Suggestions" icon={MessageSquare} badge={count}>
  <InkRecordList records="review.suggestions" bind:count>
    {#snippet empty()}No suggestions left.{/snippet}
  </InkRecordList>
</InkPanel>
```

The list and the marks share one selection: choosing a card selects its mark and scrolls the viewer there, and activating a mark selects its card. Each action runs in one undo step. `card`, `where` and `sort` replace the marks' card, filter and reading order. A new function rebuilds the list, so define them once in the script, never inline in the markup. They do not apply to a `source`, which carries its own. `bind:count` receives the number listed whenever it changes, ready for a panel badge. The `empty` snippet replaces "Nothing here yet.". To list something of your own, pass a `source` (a `RecordListSource`, as core's `recordsSource` and `searchSource` build) in place of `records`: it gets the same cards, keys and selection. With both, `source` wins.

`InkSearchResults` is the same list over the document search: one card per hit, titled with its page ("Page 2"), with its place on that page ("Match 3") and the text around it. Choosing a card makes its hit current, as the find bar's next and previous do. It has its own field, labelled "Find in document", above the cards and the find bar's match count in a footer below them; `field={false}` leaves the field out when a find bar is on the page. Field and find bar share the search state, so they never disagree.

To build your own, `useRecords<T>(name)` returns the live `records` and the `handle` to read and write them, each write one undo step, and `useRecordSelection(name)` returns `selected` and `select(id | null)`. Both need `InkRoot`. Plugins are set up once it has mounted, so until then `handle` is null, `records` is empty and nothing is selected. Both lists fill their parent's height and render empty on the server. The keys, focus and announcements are core's: see the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#record-lists).

## Custom rendering

Slots are snippets. `InkViewport` takes `loading`, `empty`, `error`, `locked`, `annotation` and `pageError`. `InkThreadPopover` takes `children` as a snippet that receives the popover's props. `InkToolButton` takes `children` as a snippet of `{ active, label }`, and `InkCommand` one of `{ label, busy }`. `InkThumbnails` and `InkOutline` take `item`, and `InkRecordList` takes `empty`. The props each receives are typed as `AnnotationSlotProps` and `ThreadPopoverSlotProps`, the same types the Vue and React packages export.

`InkDownloadButton` and `InkPrintButton` download and print the open PDF; `filename` names the download (the opened `File`'s name, else the URL's last segment, else `document.pdf`). Printing loads the file into a hidden frame and opens the browser's print dialog for it; on iOS the PDF opens in a new tab instead. Until saving into the PDF ships, both give the file as it was opened, without this session's annotations.

`InkRoot`, `InkToolbar`, `InkToolButton`, `InkToolbarButton`, `InkCommand`, `InkUndo`, `InkRedo`, `InkDownloadButton`, `InkPrintButton`, `InkSearchButton`, `InkPrevPage`, `InkNextPage`, `InkBack`, `InkForward`, `InkZoomIn` and `InkZoomOut` take a `child` snippet to render your own element. Spread the `props` it gives you on that element. The snippet type is exported as `ChildSnippet`.

```svelte
<InkToolbar>
  {#snippet child({ props })}
    <nav {...props} class="my-toolbar">…</nav>
  {/snippet}
</InkToolbar>
```

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

## Translations

`InkRoot` takes `messages` and `locale`. English is the default; French and German ship as separate entry points, so a bundler drops the ones you don't import. Both are drafts: corrections are welcome as issues.

```svelte
<script module lang="ts">
  declare function t(key: string, params?: object): string
</script>

<script lang="ts">
  import { InkRoot, InkViewport, InkToolbar, InkToolButton, InkSidebar, InkPanel } from '@inkbar/svelte'
  import { de } from '@inkbar/core/locales/de'
  import { fr } from '@inkbar/core/locales/fr'
  import { assets } from 'virtual:inkbar-assets'
  import type { InkMessagesInput } from '@inkbar/core'

  let { src }: { src: string } = $props()

  let messages = $state<InkMessagesInput>(fr)
</script>

<button onclick={() => (messages = de)}>Deutsch</button>
<InkRoot {src} {assets} {messages}>
  <InkToolbar label={() => t('toolbar')}>
    <InkToolButton tool="select-text" />
  </InkToolbar>
  <InkSidebar>
    <InkPanel id="pages" label={() => t('pages')} />
  </InkSidebar>
  <InkViewport />
</InkRoot>
```

Changing `messages` or `locale` relabels the viewer in place. The viewer does not remount, the scroll position holds, and an open menu, popover or dialog stays open. A set carries its `lang`, and without a `locale` the root's `lang` and note dates follow it. Pass `locale` to override.

A message with values is a function of one params object, so `find: { count: ({ current, total }) => t('find.count', { current, total }) }` works with any translation function. Text you supply is yours to translate. `label` on `InkToolButton`, `InkToolbar`, `InkColorMenu`, `InkPanel` and `InkThumbnail`, `handleLabel` on `InkSidebar`, `emptyText` on `InkOutline` and plugin command labels each take a string or a function. Inkbar calls the function again when `messages` or `locale` change. The [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#translations) covers `template` and `plural`.

## Styling

Components carry state on data attributes, for example `[data-annotation][data-state="selected"]` and `[data-tool="highlight"][data-state="on"]`. `@inkbar/theme` gives a default look. Your own CSS overrides it without `!important`. `InkRoot`, `InkViewport`, `InkToolbar` and the toolbar controls accept `class`.

## Hooks

`useDocument`, `useAnnotations`, `useTool`, `useSelection`, `useZoom`, `usePage`, `useHistory`, `useEmbedded`, `useCommand`, `useForm`, `useSearch`, `useToolStyle`, `useToolOptions`, `useRecords` and `useRecordSelection` read the state of the nearest `InkRoot`. Call them during component initialisation, as you would `getContext`. Each returns an object whose reactive members are getters: read `useZoom().zoom` in your template or an effect and it tracks; destructure it (`const { zoom } = useZoom()`) and you copy the value once. Keep the object and read through it. `useToolOptions('shape')` reads and sets a tool's options, such as the shape kind, which last as long as `InkRoot`. The tool style that `useToolStyle` reads and sets (colours, line style, text style) belongs to the document: opening another one starts again from the theme's defaults.

## Licence

[MIT](https://github.com/inkbar/inkbar/blob/main/LICENSE). From the team behind [Redactr](https://redactr.io).
