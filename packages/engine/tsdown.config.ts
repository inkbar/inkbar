import { readFileSync, writeFileSync } from 'node:fs'

import { defineConfig } from 'tsdown'

const vendor = (name: string) => new URL(`vendor/${name}`, import.meta.url)

export default defineConfig({
  entry: { index: 'src/index.ts', worker: 'src/worker.ts' },
  format: 'esm',
  fixedExtension: true,
  dts: true,
  platform: 'neutral',
  // The glue imports "module" only when it runs under Node.
  deps: { neverBundle: ['module'] },
  copy: [{ from: 'vendor/inkbar-pdfium.wasm', to: 'dist' }],
  hooks: {
    'build:done': () => {
      // PDFium's licence, the fork's notice, then every third-party library linked into the binary.
      const notices = ['LICENSE', 'NOTICE', 'THIRD_PARTY_LICENSES']
        .map((name) => readFileSync(vendor(name), 'utf8'))
        .join('\n')
      writeFileSync(new URL('dist/THIRD-PARTY-NOTICES', import.meta.url), notices)
    },
  },
})
