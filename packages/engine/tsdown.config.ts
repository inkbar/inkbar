import { readFileSync, writeFileSync } from 'node:fs'

import { defineConfig } from 'tsdown'

const vendor = (name: string) => new URL(`vendor/${name}`, import.meta.url)

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  fixedExtension: true,
  dts: true,
  platform: 'neutral',
  copy: [
    { from: 'vendor/inkbar-pdfium.wasm', to: 'dist' },
    { from: 'vendor/inkbar-pdfium.mjs', to: 'dist' },
  ],
  hooks: {
    'build:done': () => {
      const notices = `${readFileSync(vendor('LICENSE'), 'utf8')}\n${readFileSync(vendor('NOTICE'), 'utf8')}`
      writeFileSync(new URL('dist/THIRD-PARTY-NOTICES', import.meta.url), notices)
    },
  },
})
