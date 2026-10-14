# @inkbar/react

React components and hooks for Inkbar. The components are unstyled primitives built on `@inkbar/core`.

## Install

```sh
pnpm add @inkbar/react @inkbar/core @inkbar/theme
```

React 19 is a peer dependency. Add the Vite plugin from `@inkbar/core/vite` so the PDF engine can load its worker and fonts; the `@inkbar/core` README covers it. The package is marked `'use client'`, so a React Server Components app can import it from a server component.

## Usage

```tsx
import { useState } from 'react'
import {
  InkRoot,
  InkViewport,
  DefaultToolbar,
  InkNotePopover,
  InkSuggestionCard,
} from '@inkbar/react'
import type { Annotation } from '@inkbar/core'
import { assets } from 'virtual:inkbar-assets'
import '@inkbar/theme/theme.css'

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
      annotations={annotations}
      onAnnotationsChange={setAnnotations}
    >
      <DefaultToolbar />
      <InkViewport />
      <InkNotePopover />
      <InkSuggestionCard />
    </InkRoot>
  )
}
```

`annotations` with `onAnnotationsChange` makes your list the source of truth. Leave them off and Inkbar keeps the state itself, with undo and redo.

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

## Note popover

`InkNotePopover` opens the thread of the activated note. A new note has no text yet, so the form first writes the note's own text (labelled "Comment"); after that it adds replies.

A root note with no text and no replies is removed when its popover closes, or when activation moves to another annotation, so abandoned notes do not stay on the page. Locked notes are never removed. If you add notes yourself (`add({ type: 'note', ... })`), give them `contents`, or they will be removed the first time someone opens and closes them.

## Custom rendering

Slots are render props. `InkViewport` takes `loading`, `empty`, `error`, `renderAnnotation` and `renderPageError`; `InkNotePopover` and `InkSuggestionCard` take a function as `children`; `InkToolButton` takes a node or a function of `{ active, label }`. The props each receives are typed as `AnnotationSlotProps`, `NotePopoverSlotProps` and `SuggestionCardSlotProps`, the same types the Vue package exports.

## Keyboard

The scroll element takes focus. With the highlight or redact tool active, `Enter` turns the text selection into a mark; with the note tool, `Enter` places a note in the middle of the current page and opens it. On a focused annotation, `Enter` or `Space` selects and activates it (a note opens its thread and a suggested redaction its card; other types are only selected), `ArrowUp` and `ArrowDown` move between annotations, `Shift` + arrow moves it by 1 pt (add `Alt` for 10 pt), `Ctrl` or `Cmd` + `Shift` + arrow resizes an area mark, and `Delete` removes it. The full table is in the `@inkbar/core` README.

## Styling

Components carry state on data attributes, for example `[data-annotation][data-state="selected"]` and `[data-tool="highlight"][data-state="on"]`. `@inkbar/theme` gives a default look. Your own CSS overrides it without `!important`. `InkRoot`, `InkViewport`, `DefaultToolbar` and the toolbar controls accept `className`.

## Hooks

`useDocument`, `useAnnotations`, `useTool`, `useSelection`, `useZoom`, `usePage`, `useHistory` and `useEmbedded` read the state of the nearest `InkRoot`. Build your own toolbar or side panel from them.

MIT licence.
