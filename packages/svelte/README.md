# @inkbar/svelte

Svelte 5 components and hooks for Inkbar. The components are unstyled primitives built on `@inkbar/core`.

## Install

```sh
pnpm add @inkbar/svelte @inkbar/core @inkbar/theme
```

Svelte 5.46.4 or later is a peer dependency. Add the Vite plugin from `@inkbar/core/vite` so the PDF engine can load its worker and fonts; the `@inkbar/core` README covers it. The package ships `.svelte` sources, so your bundler compiles them for your target, including the server.

## Usage

```svelte
<script lang="ts">
  import {
    InkRoot,
    InkViewport,
    DefaultToolbar,
    InkNotePopover,
    InkSuggestionCard,
  } from '@inkbar/svelte'
  import type { Annotation } from '@inkbar/core'
  import { assets } from 'virtual:inkbar-assets'
  import '@inkbar/theme/theme.css'

  let { signedUrl, documentId }: { signedUrl: string; documentId: string } = $props()

  let annotations = $state.raw<Annotation[]>([])
</script>

<InkRoot src={{ url: signedUrl, key: documentId }} {assets} bind:annotations>
  <DefaultToolbar />
  <InkViewport />
  <InkNotePopover />
  <InkSuggestionCard />
</InkRoot>
```

`bind:annotations` makes your list the source of truth. Leave it off and Inkbar keeps the state itself, with undo and redo.

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

Inside `InkRoot`, `useHistory()` returns the same object. The instance also exposes `getDocument()` and `getStatus()`, and `bind:ref` gives you the root element.

`key` identifies the document. Reuse the same key when only the signed URL changes and the document is not reloaded.

## Note popover

`InkNotePopover` opens the thread of the activated note. A new note has no text yet, so the form first writes the note's own text (labelled "Comment"); after that it adds replies.

A root note with no text and no replies is removed when its popover closes, or when activation moves to another annotation, so abandoned notes do not stay on the page. Locked notes are never removed. If you add notes yourself (`add({ type: 'note', ... })`), give them `contents`, or they will be removed the first time someone opens and closes them.

## Custom rendering

Slots are snippets. `InkViewport` takes `loading`, `empty`, `error`, `annotation` and `pageError`. `InkNotePopover` and `InkSuggestionCard` take `children` as a snippet that receives the popover's props. `InkToolButton` takes `children` as a snippet of `{ active, label }`. The props each receives are typed as `AnnotationSlotProps`, `NotePopoverSlotProps` and `SuggestionCardSlotProps`, the same types the Vue and React packages export.

`InkRoot`, `InkToolbar`, `InkToolButton`, `InkZoomIn` and `InkZoomOut` take a `child` snippet to render your own element. Spread the `props` it gives you on that element. The snippet type is exported as `ChildSnippet`.

```svelte
<InkToolbar>
  {#snippet child({ props })}
    <nav {...props} class="my-toolbar">…</nav>
  {/snippet}
</InkToolbar>
```

## Keyboard

The scroll element takes focus. With the highlight or redact tool active, `Enter` turns the text selection into a mark; with the note tool, `Enter` places a note in the middle of the current page and opens it. On a focused annotation, `Enter` or `Space` selects and activates it (a note opens its thread and a suggested redaction its card; other types are only selected), `ArrowUp` and `ArrowDown` move between annotations, `Shift` + arrow moves it by 1 pt (add `Alt` for 10 pt), `Ctrl` or `Cmd` + `Shift` + arrow resizes an area mark, and `Delete` removes it. The full table is in the `@inkbar/core` README.

## Styling

Components carry state on data attributes, for example `[data-annotation][data-state="selected"]` and `[data-tool="highlight"][data-state="on"]`. `@inkbar/theme` gives a default look. Your own CSS overrides it without `!important`. `InkRoot`, `InkViewport`, `DefaultToolbar` and the toolbar controls accept `class`.

## Hooks

`useDocument`, `useAnnotations`, `useTool`, `useSelection`, `useZoom`, `usePage`, `useHistory` and `useEmbedded` read the state of the nearest `InkRoot`. Call them during component initialisation, as you would `getContext`. Each returns an object whose reactive members are getters: read `useZoom().zoom` in your template or an effect and it tracks; destructure it (`const { zoom } = useZoom()`) and you copy the value once. Keep the object and read through it.

MIT licence.
