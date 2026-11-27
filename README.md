<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/inkbar-mark-on-dark.svg">
    <img src=".github/assets/inkbar-mark-on-light.svg" alt="Inkbar" width="96" height="96">
  </picture>
</p>

<h1 align="center">Inkbar</h1>

<p align="center">
  A full PDF editor for your web app. No licence fee.
</p>

<p align="center">
  <a href="https://inkbar.dev">Website</a> ·
  <a href="https://inkbar.dev/docs/">Docs</a> ·
  <a href="https://sandbox.inkbar.dev">Sandbox</a> ·
  <a href="https://www.npmjs.com/org/inkbar">npm</a>
</p>

---

Your users want to read a PDF, mark it up and send it back without leaving your app. The commercial PDF SDKs do that and charge per seat or per domain. PDF.js is free, but it renders pages and stops there: the toolbar, the annotations, undo and the keyboard support are yours to build.

Inkbar fills that gap. It renders, annotates and redacts PDFs in the browser, writes the annotations into the file, gives you the parts to build its UI in Vue, React, Svelte or plain TypeScript, and is free under the MIT licence.

<p align="center">
  <img src=".github/assets/viewer.png" alt="The Inkbar viewer showing a lease clause with a highlighted phrase, a phrase struck out across a line break and a word marked for redaction. A note's comment thread is open beside the clause." width="100%">
</p>

## Why Inkbar

- **Your framework.** Components and hooks for Vue 3, React 19 and Svelte 5, plus `createViewer` for apps with no framework at all. All four share one core and one stylesheet.
- **Toolbars you assemble.** You build each toolbar in your own markup from Inkbar's controls: tool buttons, undo and redo, the zoom select, the page input. Keep the ones you need, place them where they fit and add your own. The theme styles them with zero-specificity rules, so your CSS wins without `!important`, and it reads shadcn token names if your app defines them.
- **Annotations as plain data.** Highlights, notes, drawings and redactions are typed objects. Keep them in your own state and save them to your own backend, or let Inkbar hold them. Undo and redo work either way. The annotation's data sets its shape, colours and text, and their paint is locked against stylesheets. A stylesheet adds or changes only what surrounds the drawing (the theme's outlines, note shadow and comment markers, the editor, handles and selection frame), and can still hide, move or filter elements.
- **Redaction.** Mark text or areas for redaction by hand, or add marks from your own detector through the same API. Anything your review needs, such as a reason or a score, goes in the annotation's `custom` data. The Apply redactions button removes the content under the marks, removes the file's metadata, attached files, scripts, page thumbnails and private application data, checks the result and shows the redacted file.
- **Keyboard first.** Select text and press Enter to highlight it, move between annotations with the arrow keys, and nudge them a point at a time. Area redactions, freehand drawing, loupes and masks are the ones that need a pointer.
- **Touch screens too.** Pinch to zoom the document, not the page. Under a drawing tool one finger draws and two fingers scroll.
- **Your language.** Every string comes from a `messages` object. English is the default, French and German ship as draft sets, and switching language relabels the viewer without reloading it. Bring your own translations.
- **Fits a real app.** Pass a signed URL and a stable key, and Inkbar won't reload the document when the URL rotates. You can import the document model during server rendering. Inkbar keeps nothing in `localStorage`, cookies or the network unless you pass a store that does.

### What it does today

| Area        | Available now                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Viewing     | Rendering with a selectable text layer, zoom, pinch zoom, fit to width or page, continuous or single-page layout, page navigation, thumbnails                                      |
| Navigation  | The document's outline, links you can follow by click, tap or keyboard, and back and forward through jumps                                                                         |
| Sidebars    | Panels of thumbnails, search results or your own content, resizable, saved in your storage, floating over the pages when room runs out                                             |
| Search      | A find bar and Ctrl/Cmd+F in the viewer, and `doc.search` for code                                                                                                                 |
| Forms       | Text, checkbox, radio, choice and signature fields, with the form's scripts                                                                                                        |
| Signatures  | Draw, type or upload a signature, save it and place it on any page or in a signature field                                                                                         |
| Markup      | Highlights, underlines, strikeouts and squiggly underlines from a text selection                                                                                                   |
| Notes       | Notes with reply threads                                                                                                                                                           |
| Redaction   | Text and area redaction marks; applying them removes the content, metadata, attachments and scripts, and checks the result ([limits](packages/core/README.md#applying-redactions)) |
| Drawing     | Freehand ink, shapes, lines, arrows, speech bubbles, loupes, masks and text boxes                                                                                                  |
| Annotations | JSON export and import, and the PDF's own annotations shown as locked. Other programs' unapplied redaction marks open as editable marks                                            |
| History     | Undo and redo with grouped steps, whether Inkbar or your app holds the annotations                                                                                                 |
| Files       | Download and print the open PDF, and a password prompt for locked files                                                                                                            |
| Saving      | Annotations and form values written into the PDF, and editable again when the file is reopened                                                                                     |
| Touch       | Pinch zoom, drawing with a finger, and press and long press events for plugins                                                                                                     |
| Languages   | English, with draft French and German, switched without a reload, and your own translations through `messages`                                                                     |
| Plugins     | Add commands, tools, page layers, marks and records from a plugin                                                                                                                  |

### Not there yet

- **Redacting every kind of content.** Inkbar refuses a mark over patterned fills, some gradients or some soft-masked artwork, since it cannot remove that content from the file. It does not clean hidden layers, and it does not look for the removed words elsewhere in the file, such as in bookmark titles. The [`@inkbar/core` README](packages/core/README.md#applying-redactions) lists every limit.
- **XFA forms.** The [docs](https://inkbar.dev/docs/) say what to do meanwhile.

## Install

Install the core, the theme and the package for your framework:

```sh
pnpm add @inkbar/react @inkbar/core @inkbar/theme
```

Swap `@inkbar/react` for `@inkbar/vue` or `@inkbar/svelte`. With no framework, `@inkbar/core` and `@inkbar/theme` are enough.

Inkbar reads each file with its engine, PDFium compiled to WebAssembly, and loads the engine's binary and worker, fallback fonts and form script sandbox at runtime. With Vite, the plugin serves them:

```ts
// vite.config.ts
import { inkbar } from '@inkbar/core/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [inkbar()],
})
```

Without Vite, copy the files yourself and pass their URLs. The [`@inkbar/core` README](packages/core/README.md#serving-inkbars-files) lists them.

Download, Print and `doc.save()` hand over the file with the session's annotations and changed form values written into it, and Apply redactions removes the content under the marks. A save writes redaction marks as Redact annotations and leaves the content under them; only applying redactions removes it. The [`@inkbar/core` README](packages/core/README.md#saving-into-the-pdf) says what is saved and where the saved file differs from the screen, and [Applying redactions](packages/core/README.md#applying-redactions) says what the apply removes and what it refuses.

## Quick start

A complete viewer in React, with a toolbar above the pages, page and zoom controls below, and note threads:

```tsx
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
import { assets } from 'virtual:inkbar-assets'
import '@inkbar/theme/theme.css'

const tools = [highlightTool(), redactAreaTool(), noteTool()]

export function Review({ url }: { url: string }) {
  return (
    <div style={{ height: '100vh' }}>
      <InkRoot src={url} assets={assets} tools={tools}>
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
    </div>
  )
}
```

`select-text` and `select` are always there; every other tool is opt-in through `tools`, or pass `allTools()` for all of them. The viewer fills its parent, so give the parent a height. The same example for each framework, and how to keep annotations in your own state:

- [Vue](packages/vue/README.md)
- [React](packages/react/README.md)
- [Svelte](packages/svelte/README.md)
- [Plain TypeScript](packages/core/README.md#without-a-framework)

The [sandbox](https://sandbox.inkbar.dev) runs all four on a sample document. Drop in your own PDF to try it; the file stays in your browser.

## Packages

| Package                             | What it is                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| [`@inkbar/core`](packages/core)     | Document model, rendering, annotations and tools, with no framework dependency.        |
| [`@inkbar/vue`](packages/vue)       | Vue 3 components and composables to build your viewer.                                 |
| [`@inkbar/react`](packages/react)   | React 19 components and hooks to build your viewer.                                    |
| [`@inkbar/svelte`](packages/svelte) | Svelte 5 components and hooks to build your viewer.                                    |
| [`@inkbar/theme`](packages/theme)   | The default stylesheet. Zero specificity, compatible with shadcn token names.          |
| [`@inkbar/icons`](packages/icons)   | The icons for the toolbar controls and for notes, as data, with their licence notices. |
| [`@inkbar/engine`](packages/engine) | PDFium compiled to WebAssembly. Core reads, draws, saves and redacts files with it.    |

The seven packages are released together and share one version number. The framework packages take `@inkbar/core` as a peer dependency, so your app installs one copy of it. `@inkbar/core` depends on `@inkbar/engine`, so you do not install the engine yourself.

## Development

You need Git, Node 24 and pnpm. The repository pins its pnpm version in `package.json`, so `corepack enable` picks the right one. The test fixtures are generated with [qpdf](https://qpdf.sourceforge.io/), and the browser tests run in Playwright's Chromium.

### Check out and build

```sh
git clone https://github.com/inkbar/inkbar.git
cd inkbar
pnpm install
pnpm build
```

The build downloads a prebuilt PDFium archive for `@inkbar/engine` and checks it against the hash in `packages/engine/pdfium.lock.json`. To build offline, set `INKBAR_PDFIUM_ARCHIVE` to a local copy of the archive.

### Run locally

```sh
pnpm --filter @inkbar/sandbox dev     # the sandbox on http://localhost:5190
pnpm --filter @inkbar/e2e-vue dev     # the Vue review app on http://localhost:5180
pnpm --filter @inkbar/e2e-react dev   # the React review app on http://localhost:5181
pnpm --filter @inkbar/e2e-svelte dev  # the Svelte review app on http://localhost:5182
```

The sandbox is the public demo. The review apps load every fixture and back the end-to-end, accessibility and performance tests.

### Test

```sh
pnpm lint
pnpm typecheck
pnpm test                                                # unit tests
pnpm --filter @inkbar/core exec playwright install chromium
pnpm test:browser                                        # component and end-to-end tests
```

`pnpm format` runs Prettier over the repository, and `pnpm format:check` is what CI runs.

### Layout

| Path              | Contents                                                                   |
| ----------------- | -------------------------------------------------------------------------- |
| `packages/core`   | `@inkbar/core`: the document model, the DOM layer and the Vite plugin      |
| `packages/vue`    | `@inkbar/vue`                                                              |
| `packages/react`  | `@inkbar/react`                                                            |
| `packages/svelte` | `@inkbar/svelte`                                                           |
| `packages/theme`  | `@inkbar/theme`                                                            |
| `packages/icons`  | `@inkbar/icons`                                                            |
| `packages/engine` | `@inkbar/engine`: the PDFium build and the code that drives it             |
| `apps/sandbox`    | The sandbox at sandbox.inkbar.dev                                          |
| `apps/e2e-*`      | The review apps for each framework and the end-to-end suite they share     |
| `fixtures`        | Test PDFs, the script that generates them, and helpers for the test suites |

PDF.js is imported only under `packages/core/src/pdfjs/`, which holds the sandbox that runs a form's scripts and a second reader that tests use to check the files Inkbar writes. The engine's tests and the fixtures' tests also read files with PDF.js. PDFium is used only in `packages/engine`. Every coordinate is in PDF user space: points, origin bottom-left, before `/Rotate`. Only `packages/core/src/dom/transform.ts` converts to CSS pixels.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Pull request titles are [Conventional Commits](https://www.conventionalcommits.org/), and [release-please](https://github.com/googleapis/release-please) cuts each release from them.

## Accessibility

Inkbar aims for WCAG 2.2 AA. [ACCESSIBILITY.md](ACCESSIBILITY.md) lists what works, the known gaps, and how to report a problem.

## Licence

[MIT](LICENSE). From the team behind [Redactr](https://redactr.io).
