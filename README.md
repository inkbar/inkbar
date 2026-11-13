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

Inkbar fills that gap. It renders, annotates and redacts PDFs in the browser, gives you the parts to build its UI in Vue, React, Svelte or plain TypeScript, and is free under the MIT licence.

<p align="center">
  <img src=".github/assets/viewer.png" alt="The Inkbar viewer showing a lease clause with a highlighted phrase, a phrase struck out across a line break and a word marked for redaction. A note's comment thread is open beside the clause." width="100%">
</p>

## Why Inkbar

- **Your framework.** Components and hooks for Vue 3, React 19 and Svelte 5, plus `createViewer` for apps with no framework at all. All four share one engine and one stylesheet.
- **Toolbars you assemble.** You build each toolbar in your own markup from Inkbar's controls: tool buttons, undo and redo, the zoom select, the page input. Keep the ones you need, place them where they fit and add your own. The theme styles them with zero-specificity rules, so your CSS wins without `!important`, and it reads shadcn token names if your app defines them.
- **Annotations as plain data.** Highlights, notes, drawings and redactions are typed objects. Keep them in your own state and save them to your own backend, or let Inkbar hold them. Undo and redo work either way.
- **Redaction marks.** Mark text or areas for redaction by hand, or add marks from your own detector through the same API. Anything your review needs, such as a reason or a score, goes in the annotation's `custom` data.
- **Keyboard first.** Select text and press Enter to highlight it, move between annotations with the arrow keys, and nudge them a point at a time. Area redactions, freehand drawing, loupes and masks are the ones that need a pointer.
- **Touch screens too.** Pinch to zoom the document, not the page. Under a drawing tool one finger draws and two fingers scroll.
- **Your language.** Every string comes from a `messages` object. English is the default, French and German ship as draft sets, and switching language relabels the viewer without reloading it. Bring your own translations with any library.
- **Fits a real app.** Pass a signed URL and a stable key, and Inkbar won't reload the document when the URL rotates. You can import the document model during server rendering. Inkbar keeps nothing in `localStorage`, cookies or the network unless you pass a store that does.

### What it does today

| Area        | Available now                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Viewing     | Rendering with a selectable text layer, zoom, pinch zoom, fit to width or page, continuous or single-page layout, page navigation, thumbnails |
| Navigation  | The document's outline, links you can follow by click, tap or keyboard, and back and forward through jumps                                    |
| Sidebars    | Panels of thumbnails, search results or your own content, resizable, saved in your storage, floating over the pages when room runs out        |
| Search      | A find bar and Ctrl/Cmd+F in the viewer, and `doc.search` for code                                                                            |
| Forms       | Text, checkbox, radio, choice and signature fields, with the form's scripts                                                                   |
| Signatures  | Draw, type or upload a signature, save it and place it on any page or in a signature field                                                    |
| Markup      | Highlights, underlines, strikeouts and squiggly underlines from a text selection                                                              |
| Notes       | Notes with reply threads                                                                                                                      |
| Redaction   | Text and area redaction marks                                                                                                                 |
| Drawing     | Freehand ink, shapes, lines, arrows, speech bubbles, loupes, masks and text boxes                                                             |
| Annotations | JSON export and import, and the PDF's own annotations shown as locked                                                                         |
| History     | Undo and redo with grouped steps, whether Inkbar or your app holds the annotations                                                            |
| Files       | Download and print the open PDF, and a password prompt for locked files                                                                       |
| Touch       | Pinch zoom, drawing with a finger, and press and long press events for plugins                                                                |
| Plugins     | Add commands, tools, page layers, marks and records from a plugin                                                                             |

### Not there yet

- **Saving into the PDF.** Store `exportAnnotations('json')` in your own backend and import it on the next open. Download and print give the file as it was opened.
- **Applying redactions.** A redaction mark is a tinted box over the content. The text under it still renders and can be copied. Inkbar will remove content once saving into the PDF ships.
- **Saving field values into the PDF.** Values stay in memory. Export them with the annotations.
- **XFA forms and translations.** The [docs](https://inkbar.dev/docs/) say what to do meanwhile.

## Install

Install the core, the theme and the package for your framework:

```sh
pnpm add @inkbar/react @inkbar/core @inkbar/theme
```

Swap `@inkbar/react` for `@inkbar/vue` or `@inkbar/svelte`. With no framework, `@inkbar/core` and `@inkbar/theme` are enough.

PDF.js loads a worker, fonts and decoders at runtime. With Vite, the plugin serves them:

```ts
// vite.config.ts
import { inkbar } from '@inkbar/core/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [inkbar()],
})
```

Without Vite, copy the files yourself and pass their URLs. The [`@inkbar/core` README](packages/core/README.md#serving-pdfjs-assets) lists them.

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

| Package                             | What it is                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| [`@inkbar/core`](packages/core)     | Document model, rendering, annotations and tools, with no framework dependency. |
| [`@inkbar/vue`](packages/vue)       | Vue 3 components and composables to build your viewer.                          |
| [`@inkbar/react`](packages/react)   | React 19 components and hooks to build your viewer.                             |
| [`@inkbar/svelte`](packages/svelte) | Svelte 5 components and hooks to build your viewer.                             |
| [`@inkbar/theme`](packages/theme)   | The default stylesheet. Zero specificity, compatible with shadcn token names.   |
| [`@inkbar/icons`](packages/icons)   | The icons the toolbar controls show, as data, with their licence notices.       |

The six packages are released together and share one version number. The framework packages take `@inkbar/core` as a peer dependency, so your app installs one copy of it.

## Development

You need Git, Node 24 and pnpm. The repository pins its pnpm version in `package.json`, so `corepack enable` picks the right one. The test fixtures are generated with [qpdf](https://qpdf.sourceforge.io/), and the browser tests run in Playwright's Chromium.

### Check out and build

```sh
git clone https://github.com/inkbar/inkbar.git
cd inkbar
pnpm install
pnpm build
```

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
| `apps/sandbox`    | The sandbox at sandbox.inkbar.dev                                          |
| `apps/e2e-*`      | The review apps for each framework and the end-to-end suite they share     |
| `fixtures`        | Test PDFs, the script that generates them, and helpers for the test suites |

PDF.js is imported only under `packages/core/src/pdfjs/`. Every coordinate is in PDF user space: points, origin bottom-left, before `/Rotate`. Only `packages/core/src/dom/transform.ts` converts to CSS pixels.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Pull request titles are [Conventional Commits](https://www.conventionalcommits.org/), and [release-please](https://github.com/googleapis/release-please) cuts each release from them.

## Accessibility

Inkbar aims for WCAG 2.2 AA. [ACCESSIBILITY.md](ACCESSIBILITY.md) lists what works, the known gaps, and how to report a problem.

## Licence

[MIT](LICENSE). From the team behind [Redactr](https://redactr.io).
