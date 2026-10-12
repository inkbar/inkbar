# @inkbar/core

Document model, rendering and annotations for the browser, with no framework dependency. Renders with PDF.js and stores every coordinate in PDF user space (points, origin bottom-left, before `/Rotate`).

- `@inkbar/core` holds the document model and annotation store. It is safe to import during server rendering.
- `@inkbar/core/dom` renders pages, text layers and annotation layers into the DOM.
- `@inkbar/core/vite` is a Vite plugin that serves the PDF.js assets.

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

`file` can be a `File`, `Blob`, `Uint8Array`, a URL string, or `{ url, key }` when the URL is signed and changes between loads. `quads` is a list of quads in PDF user space.

Writing annotations back into the PDF needs `@inkbar/engine`, which is not released yet. Until then `save()` rejects with `EngineUnavailable`. Persist `exportAnnotations('json')` instead and re-import it on the next open.

The DOM layer (`@inkbar/core/dom`) provides the viewport, canvas renderer, text layer, overlay and tools for hosts without a framework package. Vue hosts should use `@inkbar/vue`.

## Serving PDF.js assets

PDF.js needs a worker script plus directories of CMaps, standard fonts, wasm decoders and ICC profiles. Inkbar loads them from URLs you pass as the `assets` option. The option has no default, because the right URLs depend on how you deploy your app.

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

In development the plugin serves the files from `node_modules`. In a build it copies them into `<outDir>/inkbar/`. The URLs respect your `base`. With a relative `base` such as `./`, the plugin resolves the URLs at runtime from the location of your bundle, so the build works from any path. Pass `inkbar({ assetsDir: 'pdf' })` to use a different directory name.

For TypeScript, reference the module declaration once, for example in `env.d.ts`:

```ts
/// <reference types="@inkbar/core/vite/client" />
```

### Without Vite

Copy these from the installed `pdfjs-dist` package to a path your server exposes:

- `build/pdf.worker.min.mjs`
- `cmaps/`
- `standard_fonts/`
- `wasm/`
- `iccs/` (optional)

Pass their URLs. Directory URLs end in `/`:

```ts
const assets = {
  worker: '/pdfjs/pdf.worker.min.mjs',
  cMaps: '/pdfjs/cmaps/',
  standardFonts: '/pdfjs/standard_fonts/',
  wasm: '/pdfjs/wasm/',
  icc: '/pdfjs/iccs/',
}
```

Use the `pdfjs-dist` version that `@inkbar/core` depends on, so the worker matches the library.
