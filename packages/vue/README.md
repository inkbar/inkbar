<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-dark.svg">
    <img src="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-light.svg" alt="Inkbar" width="72" height="72">
  </picture>
</p>

<h1 align="center">@inkbar/vue</h1>

<p align="center">
  A PDF viewer and editor for Vue 3. No licence fee.
</p>

<p align="center">
  <a href="https://inkbar.dev">Website</a> ·
  <a href="https://inkbar.dev/docs/">Docs</a> ·
  <a href="https://sandbox.inkbar.dev">Sandbox</a> ·
  <a href="https://github.com/inkbar/inkbar">GitHub</a>
</p>

---

Drop a PDF viewer into your Vue app and let people highlight text, leave notes with replies and redact. `@inkbar/vue` gives you components and composables to build your own toolbars, plus a popover for comment threads, all styled by `@inkbar/theme`.

Annotations are plain typed objects. Bind them with `v-model` to keep them in your own state, or let Inkbar hold them with undo and redo.

## Install

```sh
pnpm add @inkbar/vue @inkbar/core @inkbar/theme
```

Vue 3.5 or later is a peer dependency. Add the Vite plugin from `@inkbar/core/vite` so PDF.js can load its worker and fonts; the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#serving-pdfjs-assets) covers it.

## Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'
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
} from '@inkbar/vue'
import { highlightTool, noteTool, redactAreaTool } from '@inkbar/core/dom'
import type { Annotation } from '@inkbar/core'
import { assets } from 'virtual:inkbar-assets'
import '@inkbar/theme/theme.css'

defineProps<{ signedUrl: string; documentId: string }>()

const annotations = ref<Annotation[]>([])
const tools = [highlightTool(), redactAreaTool(), noteTool()]
</script>

<template>
  <InkRoot
    :src="{ url: signedUrl, key: documentId }"
    :assets="assets"
    :tools="tools"
    v-model:annotations="annotations"
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
</template>
```

`select-text` and `select` are always there. Every other tool is opt-in: pass the ones you offer through `tools`, from the tool factories in `@inkbar/core/dom`, or `allTools()` for all of them. A button for a tool you did not pass renders disabled and hidden, a tool menu renders nothing, and each logs an `InkError('UnknownTool')` to the console once. If the active tool leaves `tools`, the viewer switches to `select-text` and reports it through `update:tool`.

Each control is a separate component, so put them in any order or leave some out. Buttons show icons from `@inkbar/icons`. Put your own in a button's default slot to replace one, and use `InkIcon` to put the same icons on your own buttons. For a button of your own, such as `<InkToolbarButton @click="download">Download</InkToolbarButton>`, use `InkToolbarButton`: it joins the toolbar's arrow-key focus and looks like the other buttons.

`v-model:annotations` makes your list the source of truth. Leave it off and Inkbar keeps the state itself, with undo and redo.

## Controlled mode

With `v-model:annotations`, Inkbar proposes each change through `update:annotations` and shows whatever list you pass back. To change annotations yourself, replace the array: `annotations.value = [...annotations.value, next]`. In-place mutation (`push`, `splice`, editing an item) is not observed, so the viewer never sees it.

Undo and redo are off in controlled mode unless you pass `:history="true"`. Inkbar then keeps a stack of your list's past values and applies undo and redo through `v-model`. Every change to the list is a step, including the list you load from your server when the document opens. Clear the history once that load has reached the viewer, so the first undo does not empty the list:

```ts
const root = useTemplateRef<InstanceType<typeof InkRoot>>('root')

async function onReady(doc: InkDocument) {
  annotations.value = await loadAnnotations(doc.key)
  await nextTick()
  root.value?.history.clear()
}
```

Inside `InkRoot`, `useHistory()` returns the same object. Its `batch(fn)` runs `fn` and records what it changes as one undo step. With `:history="true"` on a controlled list, you still get one `update:annotations` event per add. The step lands when the current task ends, and `canUndo` updates then. Any other change you apply to the list in that window joins the step. In both modes, `fn` must be synchronous.

`key` identifies the document. Reuse the same key when only the signed URL changes and the document is not reloaded.

## Forms

`InkViewport` fills the PDF's form fields and runs the form's scripts. `useForm()` returns the fields, their values, and `set` and `reset`. Bind `v-model:fields` to hold the values in your own state. The form never submits, opens a link, sends mail or prints: `@form-action` hands each request to you. `:form-highlight="false"` turns off the field tint, and a change applies to the open document in place.

The [forms guide](https://inkbar.dev/docs/guides/forms/) covers controlled fields, form actions, scripts, signature fields and saving values as Gloss.

## Thread popover

`InkThreadPopover` opens the comment thread of the activated note or text markup (a highlight, underline, strikeout or squiggly). A new note or highlight has no text yet, so the form first writes its own `contents` (labelled "Comment"); after that it adds replies. A highlight with a comment shows a small marker at its end. Replies show in the thread only; the page draws just the note or highlight they answer.

A root note with no text and no replies is removed when its popover closes, or when activation moves to another annotation, so abandoned notes do not stay on the page. A highlight stays: the mark is the point. Locked annotations are never removed. If you add notes yourself (`add({ type: 'text', ... })`), give them `contents`, or they will be removed the first time someone opens and closes them.

The highlight tool leaves `contents` free for the comment. `doc.text(page)` returns the page's text items; match the markup's `quads` against them to get the marked text. `InkHighlightMenu` is a split button for the tool: it picks the markup kind and its colour.

## Signatures

`InkSignatureMenu` lists saved signatures, picks one for the `signature` tool, removes them, and opens `InkSignatureDialog` to draw, type or upload a new one. The menu needs `signatureTool()` in `tools`. The dialog and signature form fields work without it; the dialog then only saves the signature. These are marks on the page, not cryptographic signatures. Pass `signatures` to `InkRoot` to keep them somewhere: `createLocalSignatureStore(key)` from `@inkbar/core` uses `localStorage`, and without it they last until reload. `signatureFonts` lists the handwriting fonts the Type tab offers; load them with `@font-face`. A placed signature keeps its aspect ratio when resized.

## Plugins

A plugin from `definePlugin` (in `@inkbar/core/dom`) adds commands, tools, decorations, page layers and its own record stores. Pass plugins to `InkRoot` once: the prop is read when the root is created. Nothing a plugin registers shows until you place it:

```vue
<InkRoot :src="src" :assets="assets" :plugins="[suggestions]">
  <InkToolbar>
    <InkCommand id="sandbox.suggest" />
    <InkToolButton tool="sandbox.stamp" />
  </InkToolbar>
  <InkViewport />
</InkRoot>
```

`InkCommand` is a button named by the command's label, disabled while the command is, and its status in a live region beside it. While the command runs, the button keeps focus and has `aria-busy` and `aria-disabled`, and pressing it does nothing. It shows the command's icon, or its label as text when the command has no icon. To build your own, `useCommand(id)` returns `run`, `enabled`, `busy`, `status`, `label` and `icon`. Plugins are set up once `InkRoot` has mounted in the browser, never on the server. Until then the command is disabled and has no label, and `InkCommand` keeps its button out of the accessibility tree (`aria-hidden`). `label` and `icon` are refs, like `enabled`, so they fill in then. An id no plugin registered stays that way: `InkCommand` and `useCommand` log an `InkError('UnknownCommand')` to the console once, naming the id and the registered ones, and nothing throws. A plugin whose `setup` throws does not stop the document opening; its error is rethrown to Vue's error handling (`onErrorCaptured`, `app.config.errorHandler`). `InkToolButton` takes a plugin tool's own label and icon.

Plugin stores undo with annotations. In controlled mode with `:history="true"`, each undo step also snapshots the plugin stores, so accepting something and undoing it restores both.

## Search

`InkFindBar` is the find bar and `InkSearchButton` opens it. Place the bar anywhere inside `InkRoot`, once `InkViewport` is there; Ctrl/Cmd+F opens it while it is mounted. `useSearch()` returns the search `state` and its actions (`open`, `setQuery`, `setMatchCase`, `next`, `previous`, `close`) for your own control. See the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#search) for the API.

## Sidebars

`InkSidebar` holds `InkPanel`s and places nothing itself: put it beside `InkViewport` with your own flex or grid layout. Each panel has an `id`, a `label`, an optional `icon` (an `IconNode` from `@inkbar/icons`) and an optional `badge`, a number or short string hidden when empty or 0. Its default slot is the panel's content, your own component or one of Inkbar's.

```vue
<InkRoot :src="src" :assets="assets">
  <div class="app">
    <InkSidebar side="left" layout="rail" v-model:open="open">
      <InkPanel id="pages" label="Pages" :icon="Square">
        <InkThumbnails />
      </InkPanel>
      <InkPanel id="notes" label="Notes" :icon="MessageSquare" :badge="noteCount">
        <MyNotes />
      </InkPanel>
    </InkSidebar>
    <InkViewport />
  </div>
</InkRoot>
```

`layout` is `rail` (default: icon buttons on the outer edge, and activating the open panel's button closes it), `tabs` (labelled tabs, one panel open) or `stack` (a header per panel, any number expanded). `side` (`left` by default) decides which edge the rail and border sit on. `v-model:open` is the open panel's id, or `null`, for rail and tabs, and the expanded ids for stack. Left unbound, the first panel starts open. When the open panel goes (a `v-if`), rail and tabs open the first one left and stack drops it, and `v-model:open` receives the new value.

Panels take their place in the order they appear in the template, including one added later with `v-if`. A closed panel stays mounted and hidden, so its content keeps its state and scroll position, across layout changes too. The keys and ARIA are core's: see the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#sidebars). The sidebar needs no document and works outside `InkRoot`. On the server it renders its frame with the open panel showing, and the stack headers; rail and tab buttons follow once it has mounted.

## Thumbnails

`InkThumbnail` draws one page (0-based `page`) as a small image, with its annotations and plugin marks. Give it a `width` or a `height` and the other follows the page; with neither it is 120px wide. `:annotations="false"` and `:marks="false"` leave those out, and `label` replaces its accessible name ("Page 4" for page 3). It is an image with no focus or click behaviour, so wrap it in the control you need, a checkbox label in a dialog for instance.

`InkThumbnails` lists the pages as thumbnails, each a button that scrolls the viewport to its page, with the current page marked `aria-current="page"`. It fills its parent's height and scrolls. `pages` lists the pages to show, in order; `width`, `annotations` and `marks` pass to each thumbnail. Only the items near the visible part are mounted. The `item` slot adds to each item after its page number:

```vue
<InkThumbnails>
  <template #item="{ page, current }">
    <span class="page-count">{{ counts[page] }}</span>
  </template>
</InkThumbnails>
```

An item's height is worked out from its page alone, so position what you add absolutely. Both need `InkRoot` and render empty on the server.

## Record lists

`InkRecordList` lists a plugin's records as cards, the same cards their marks open, with the same actions. Name the records `<plugin>.<name>`:

```vue
<InkPanel id="suggestions" label="Suggestions" :icon="MessageSquare" :badge="count">
  <InkRecordList records="review.suggestions" @update:count="count = $event">
    <template #empty>No suggestions left.</template>
  </InkRecordList>
</InkPanel>
```

The list and the marks share one selection: choosing a card selects its mark and scrolls the viewer there, and activating a mark selects its card. Each action runs in one undo step. `card`, `where` and `sort` replace the marks' card, filter and reading order. Changing one rebuilds the list, so define them once in your script, not inline in the template. `update:count` gives the number listed whenever it changes, ready for a panel badge. The `empty` slot replaces "Nothing here yet.". To list something of your own, pass a `source` (a `RecordListSource`, as core's `recordsSource` and `searchSource` build) in place of `records`: it gets the same cards, keys and selection. With both, `source` wins.

`InkSearchResults` is the same list over the document search: one card per hit, titled with its page ("Page 2"), with its place on that page ("Match 3") and the text around it. Choosing a card makes its hit current, as the find bar's next and previous do. It has its own field, labelled "Find in document", and the find bar's match count; `:field="false"` leaves the field out when a find bar is on the page. Field and find bar share the search state, so they never disagree.

To build your own, `useRecords<T>(name)` returns the live `records` and the `handle` to read and write them, each write one undo step, and `useRecordSelection(name)` returns `selected` and `select(id | null)`. Both need `InkRoot`. Plugins are set up once it has mounted, so until then `handle` is null, `records` is empty and nothing is selected. Both lists fill their parent's height and render empty on the server. The keys, focus and announcements are core's: see the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#record-lists).

## Custom rendering

Slots let you render parts yourself. `InkViewport` has `loading`, `empty`, `error`, `annotation` and `page-error` slots. `InkThreadPopover` has a scoped default slot that receives the popover's props, and the default slot of `InkToolButton` receives `{ active, label }`. The props are typed as `AnnotationSlotProps` and `ThreadPopoverSlotProps`, the same types the React and Svelte packages export.

`InkRoot`, `InkToolbar`, `InkToolButton`, `InkCommand`, `InkUndo`, `InkRedo`, `InkPrevPage`, `InkNextPage`, `InkZoomIn` and `InkZoomOut` take `as-child` to render your own element in place of theirs, such as a button from your design system. Put that element in the default slot. The control keeps its behaviour and accessible name.

## Keyboard

The scroll area takes focus. From there:

- With the `highlight` or `redact-area` tool active, `Enter` turns the text selection into a mark.
- With the `note` tool active, `Enter` places a note at the centre of the current page and opens it.
- With the `signature` tool active, `Enter` places the chosen signature at the centre of the current page.
- `Ctrl` or `Cmd` + `Z` undoes. `Ctrl` or `Cmd` + `Shift` + `Z`, or `Ctrl` + `Y`, redoes. `Ctrl` and `Cmd` both work on every platform. The keys do what `InkUndo` and `InkRedo` do, from anywhere in `InkRoot`, toolbars included, and act only while that button is enabled. In a text field or editable content the keys stay with the element, so a field keeps its own text undo. In a `<select>` they are left to the browser, which does nothing with them.

On a focused annotation:

- `Enter` or `Space` selects and activates it. A note or text markup opens its thread; other types are only selected.
- `ArrowUp` and `ArrowDown` move to the previous or next annotation on the page.
- `Shift` + arrow moves it by 1 pt, or by 10 pt with `Alt` as well.
- `Ctrl` or `Cmd` + `Shift` + arrow resizes an area redaction, text box or shape.
- `Delete` or `Backspace` removes it.

The full table, with the zoom and page keys, is in the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#tools-and-keyboard).

## Styling

Components carry state on data attributes, for example `[data-annotation][data-state="selected"]` and `[data-tool="highlight"][data-state="on"]`. `@inkbar/theme` gives a default look. Your own CSS overrides it without `!important`.

## Composables

`useDocument`, `useAnnotations`, `useTool`, `useSelection`, `useZoom`, `usePage`, `useHistory`, `useEmbedded`, `useCommand`, `useRecords` and `useRecordSelection` read the state of the nearest `InkRoot`. Build your own toolbar or side panel from them. Tool options, such as the shape kind, last as long as `InkRoot`. The tool style that `useToolStyle` reads and sets (colours, line style, text style) belongs to the document: opening another one starts again from the theme's defaults.

## Licence

[MIT](https://github.com/inkbar/inkbar/blob/main/LICENSE). From the team behind [Redactr](https://redactr.io).
