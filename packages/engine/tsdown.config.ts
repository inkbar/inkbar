import { readFileSync, writeFileSync } from 'node:fs'

import { defineConfig, type UserConfig } from 'tsdown'

const vendor = (name: string) => new URL(`vendor/${name}`, import.meta.url)

/**
 * The glue loads Node's `module` with `await import("module")`, only when it runs under Node. A
 * browser bundler still sees the literal import, resolves it and warns. Node has
 * `getBuiltinModule` from 22.3, which no bundler follows.
 */
const nodeOnlyImport = {
  name: 'inkbar:glue-node-import',
  transform(code: string, id: string) {
    if (!id.endsWith('vendor/inkbar-pdfium.mjs')) return null
    const parts = code.split('await import("module")')
    if (parts.length !== 2)
      throw new Error(
        `Expected one import("module") in the PDFium glue, found ${parts.length - 1}.`
      )
    return { code: parts.join('process.getBuiltinModule("module")'), map: null }
  },
}

const shared: UserConfig = {
  format: 'esm',
  fixedExtension: true,
  dts: true,
  platform: 'neutral',
  plugins: [nodeOnlyImport],
}

// Two builds, so neither entry shares a chunk with the other: a host can serve `worker.mjs`
// on its own, beside the wasm, without the rest of `dist`. tsdown cleans once before both.
export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts' },
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
  },
  { ...shared, entry: { worker: 'src/worker.ts' } },
])
