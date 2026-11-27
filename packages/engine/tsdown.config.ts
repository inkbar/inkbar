import { readFileSync, writeFileSync } from 'node:fs'

import { defineConfig, type UserConfig } from 'tsdown'

const vendor = (name: string) => new URL(`vendor/${name}`, import.meta.url)

/**
 * The glue's last-resort wasm lookup is a literal `new URL("inkbar-pdfium.wasm", import.meta.url)`,
 * which a bundler follows and copies. The engine always passes the wasm or a `locateFile`, so the
 * lookup never runs. Building the name at run time keeps it as a fallback and hides it from a
 * bundler, so the `bare` entry leaves no copy of the binary behind.
 */
const glueWasmLookup = 'new URL("inkbar-pdfium.wasm",import.meta.url)'

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
    const lookups = code.split(glueWasmLookup)
    if (lookups.length !== 2)
      throw new Error(
        `Expected one ${glueWasmLookup} in the PDFium glue, found ${lookups.length - 1}.`
      )
    const hidden = parts
      .join('process.getBuiltinModule("module")')
      .replace(
        glueWasmLookup,
        'new URL(["inkbar-pdfium", "wasm"].join("."), import.meta.url)'
      )
    return { code: hidden, map: null }
  },
}

const shared: UserConfig = {
  format: 'esm',
  fixedExtension: true,
  dts: true,
  platform: 'neutral',
  plugins: [nodeOnlyImport],
}

// Two builds. The index and bare entries share a chunk, which holds the engine and the PDFium
// glue; the worker is built apart, with nothing shared, so a host can serve `worker.mjs` on its
// own, beside the wasm, without the rest of `dist`. tsdown cleans once before both. Only the
// worker is minified: a host serves it as built, while it bundles the index and bare entries again.
export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts', bare: 'src/bare.ts' },
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
  { ...shared, entry: { worker: 'src/worker.ts' }, minify: true },
])
