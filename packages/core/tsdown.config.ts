import { readFileSync } from 'node:fs'

import { defineConfig } from 'tsdown'

const { version } = JSON.parse(
  readFileSync(new URL('package.json', import.meta.url), 'utf8')
) as { version: string }

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    dom: 'src/dom/index.ts',
    vite: 'src/vite/index.ts',
    'locales/en': 'src/locales/en.ts',
    'locales/fr': 'src/locales/fr.ts',
    'locales/de': 'src/locales/de.ts',
  },
  format: 'esm',
  fixedExtension: true,
  dts: true,
  platform: 'neutral',
  // Ambient declarations for `virtual:inkbar-assets`, referenced as `@inkbar/core/vite/client`.
  copy: [{ from: 'src/vite/client.d.ts', to: 'dist/vite' }],
  // `version` in src/index.ts.
  define: { __INKBAR_VERSION__: JSON.stringify(version) },
  // Zod's `jitless` goes on before Gloss's schemas are built, when `gloss-format` is imported:
  // that step is a chunk of its own, which the chunk holding the schemas imports before
  // `gloss-format`. The step that puts it back stays in that chunk, after the schemas.
  // `sideEffects` in package.json keeps both.
  outputOptions: {
    codeSplitting: {
      groups: [{ name: 'schema-build-begin', test: /schema-build[\\/]begin/ }],
    },
  },
  deps: { neverBundle: ['pdfjs-dist', '#pdfjs-sandbox', 'vite', /^node:/] },
})
