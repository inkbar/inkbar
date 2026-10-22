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

Each control is a separate component, so put them in any order or leave some out. Buttons show icons from `@inkbar/icons`. Pass your own as `children` to replace one, and use `InkIcon` to put the same icons on your own buttons.

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

## Thread popover

`InkThreadPopover` opens the comment thread of the activated note or text markup (a highlight, underline, strikeout or squiggly). A new note or highlight has no text yet, so the form first writes its own `contents` (labelled "Comment"); after that it adds replies. A highlight with a comment shows a small marker at its end. Replies show in the thread only; the page draws just the note or highlight they answer.

A root note with no text and no replies is removed when its popover closes, or when activation moves to another annotation, so abandoned notes do not stay on the page. A highlight stays: the mark is the point. Locked annotations are never removed. If you add notes yourself (`add({ type: 'text', ... })`), give them `contents`, or they will be removed the first time someone opens and closes them.

The highlight tool leaves `contents` free for the comment. `doc.text(page)` returns the page's text items; match the markup's `quads` against them to get the marked text. `InkHighlightMenu` is a split button for the tool: it picks the markup kind and its colour.

## Signatures

`InkSignatureMenu` lists saved signatures, picks one for the `signature` tool, removes them, and opens `InkSignatureDialog` to draw, type or upload a new one. These are marks on the page, not cryptographic signatures. Pass `signatures` to `InkRoot` to keep them somewhere: `createLocalSignatureStore(key)` from `@inkbar/core` uses `localStorage`, and without it they last until reload. `signatureFonts` lists the handwriting fonts the Type tab offers; load them with `@font-face`. A placed signature keeps its aspect ratio when resized.

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

`InkCommand` is a button named by the command's label, disabled while the command is, with `aria-busy` while it runs, and its status in a live region beside it. It shows the command's icon, or its label as text when the command has no icon. To build your own, `useCommand(id)` returns `run`, `enabled`, `busy`, `status`, `label` and `icon`. Plugins are set up once `InkRoot` has mounted in the browser, never on the server. Until then the command is disabled and has no label, and `InkCommand` keeps its button out of the accessibility tree (`aria-hidden`). After that, both throw `UnknownCommand` for an id no plugin registered. `InkToolButton` takes a plugin tool's own label and icon.

Plugin stores undo with annotations. In controlled mode with `history`, each undo step also snapshots the plugin stores, so accepting something and undoing it restores both.

## Custom rendering

Slots are render props. `InkViewport` takes `loading`, `empty`, `error`, `renderAnnotation` and `renderPageError`; `InkThreadPopover` takes a function as `children`; `InkToolButton` takes a node or a function of `{ active, label }`; `InkCommand` a node or a function of `{ label, busy }`. The props each receives are typed as `AnnotationSlotProps` and `ThreadPopoverSlotProps`, the same types the Vue package exports.

`InkRoot`, `InkToolbar`, `InkToolButton`, `InkCommand`, `InkUndo`, `InkRedo`, `InkPrevPage`, `InkNextPage`, `InkZoomIn` and `InkZoomOut` take `asChild` to render your own element in place of theirs, such as a button from your design system. Pass that element as the only child. The control keeps its behaviour and accessible name.

## Keyboard

The scroll area takes focus. From there:

- With the `highlight` or `redact-area` tool active, `Enter` turns the text selection into a mark.
- With the `note` tool active, `Enter` places a note at the centre of the current page and opens it.
- With the `signature` tool active, `Enter` places the chosen signature at the centre of the current page.

On a focused annotation:

- `Enter` or `Space` selects and activates it. A note or text markup opens its thread; other types are only selected.
- `ArrowUp` and `ArrowDown` move to the previous or next annotation on the page.
- `Shift` + arrow moves it by 1 pt, or by 10 pt with `Alt` as well.
- `Ctrl` or `Cmd` + `Shift` + arrow resizes an area redaction, text box or shape.
- `Delete` or `Backspace` removes it.

The full table, with the zoom and page keys, is in the [`@inkbar/core` README](https://github.com/inkbar/inkbar/tree/main/packages/core#tools-and-keyboard).

## Styling

Components carry state on data attributes, for example `[data-annotation][data-state="selected"]` and `[data-tool="highlight"][data-state="on"]`. `@inkbar/theme` gives a default look. Your own CSS overrides it without `!important`. `InkRoot`, `InkViewport`, `InkToolbar` and the toolbar controls accept `className`.

## Hooks

`useDocument`, `useAnnotations`, `useTool`, `useSelection`, `useZoom`, `usePage`, `useHistory`, `useEmbedded` and `useCommand` read the state of the nearest `InkRoot`. Build your own toolbar or side panel from them. Tool options, such as the shape kind, last as long as `InkRoot`. The tool style that `useToolStyle` reads and sets (colours, line style, text style) belongs to the document: opening another one starts again from the theme's defaults.

## Licence

[MIT](https://github.com/inkbar/inkbar/blob/main/LICENSE). From the team behind [Redactr](https://redactr.io).
