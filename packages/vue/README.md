# @inkbar/vue

Vue 3 components and composables for Inkbar. The components are unstyled primitives built on `@inkbar/core`.

## Install

```sh
pnpm add @inkbar/vue @inkbar/core @inkbar/theme
```

Vue 3.5 or later is a peer dependency. Add the Vite plugin from `@inkbar/core/vite` so PDF.js can load its worker and fonts; the `@inkbar/core` README covers it.

## Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  InkRoot,
  InkViewport,
  DefaultToolbar,
  InkNotePopover,
  InkSuggestionCard,
} from '@inkbar/vue'
import type { Annotation } from '@inkbar/core'
import { assets } from 'virtual:inkbar-assets'
import '@inkbar/theme/theme.css'

defineProps<{ signedUrl: string; documentId: string }>()

const annotations = ref<Annotation[]>([])
</script>

<template>
  <InkRoot
    :src="{ url: signedUrl, key: documentId }"
    :assets="assets"
    v-model:annotations="annotations"
  >
    <DefaultToolbar />
    <InkViewport />
    <InkNotePopover />
    <InkSuggestionCard />
  </InkRoot>
</template>
```

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

Inside `InkRoot`, `useHistory()` returns the same object. `batch(fn)` records everything `fn` changes as one undo step.

`key` identifies the document. Reuse the same key when only the signed URL changes and the document is not reloaded.

## Note popover

`InkNotePopover` opens the thread of the activated note. A new note has no text yet, so the form first writes the note's own text (labelled "Comment"); after that it adds replies.

A root note with no text and no replies is removed when its popover closes, or when activation moves to another annotation, so abandoned notes do not stay on the page. Locked notes are never removed. If you add notes yourself (`add({ type: 'note', ... })`), give them `contents`, or they will be removed the first time someone opens and closes them.

## Keyboard

The scroll element takes focus. With the highlight or redact tool active, `Enter` turns the text selection into a mark; with the note tool, `Enter` places a note in the middle of the current page and opens it. On a focused annotation, `Enter` or `Space` selects and activates it (a note opens its thread and a suggested redaction its card; other types are only selected), `ArrowUp` and `ArrowDown` move between annotations, `Shift` + arrow moves it by 1 pt (add `Alt` for 10 pt), `Ctrl` or `Cmd` + `Shift` + arrow resizes an area mark, and `Delete` removes it. The full table is in the `@inkbar/core` README.

## Styling

Components carry state on data attributes, for example `[data-annotation][data-state="selected"]` and `[data-tool="highlight"][data-state="on"]`. `@inkbar/theme` gives a default look. Your own CSS overrides it without `!important`.

## Composables

`useDocument`, `useAnnotations`, `useTool`, `useSelection`, `useZoom`, `usePage`, `useHistory` and `useEmbedded` read the state of the nearest `InkRoot`. Build your own toolbar or side panel from them.

MIT licence.
