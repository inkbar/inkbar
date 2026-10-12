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
  },
  format: 'esm',
  fixedExtension: true,
  dts: true,
  platform: 'neutral',
  // Ambient declarations for `virtual:inkbar-assets`, referenced as `@inkbar/core/vite/client`.
  copy: [{ from: 'src/vite/client.d.ts', to: 'dist/vite' }],
  // `version` in src/index.ts.
  define: { __INKBAR_VERSION__: JSON.stringify(version) },
  deps: { neverBundle: ['pdfjs-dist', '#pdfjs', 'vite', /^node:/] },
})
