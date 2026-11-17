import { execFileSync } from 'node:child_process'
import { access, readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { fixtureBytes } from '@inkbar/fixtures'
import { expect, test } from 'vitest'

import type { createEngine as CreateEngine } from './index.ts'

// Runs against the built package; turbo builds it before `test`.
test('the built package finds its own wasm and opens a document', async () => {
  const built = new URL('../dist/index.mjs', import.meta.url)
  await access(built).catch(() => {
    throw new Error('dist/index.mjs is missing: build the package first (pnpm build)')
  })
  const { createEngine } = (await import(built.href)) as {
    createEngine: typeof CreateEngine
  }
  const engine = await createEngine({ worker: false })
  try {
    const doc = await engine.open(await fixtureBytes('text-simple'))
    expect(doc.pageCount).toBe(3)
  } finally {
    await engine.destroy()
  }
})

test('the built package keeps the literal worker form that bundlers detect', async () => {
  const source = await readFile(new URL('../dist/index.mjs', import.meta.url), 'utf8')
  expect(source).toMatch(
    /new Worker\(\s*new URL\(\s*["']\.\/worker\.mjs["']\s*,\s*import\.meta\.url\s*\)/
  )
})

test('the built package carries the licences of everything in the binary', async () => {
  const notices = await readFile(
    new URL('../dist/THIRD-PARTY-NOTICES', import.meta.url),
    'utf8'
  )
  const vendor = (name: string) =>
    readFile(new URL(`../vendor/${name}`, import.meta.url), 'utf8')
  const licence = await vendor('LICENSE')
  const notice = await vendor('NOTICE')
  const thirdParty = await vendor('THIRD_PARTY_LICENSES')
  const at = (text: string) => notices.indexOf(text)
  expect(at(licence)).toBe(0)
  expect(at(notice)).toBeGreaterThan(at(licence))
  expect(at(thirdParty)).toBeGreaterThan(at(notice))
  for (const library of ['FreeType', 'libjpeg-turbo', 'OpenJPEG', 'zlib', 'Emscripten'])
    expect(thirdParty).toContain(library)
})

test('the built entry points leave no literal node: import for a browser bundler', async () => {
  const names = (await readdir(new URL('../dist/', import.meta.url))).filter((file) =>
    file.endsWith('.mjs')
  )
  expect(names).toContain('index.mjs')
  for (const name of names) {
    const source = await readFile(new URL(`../dist/${name}`, import.meta.url), 'utf8')
    expect(source, name).not.toMatch(/import\((?:\s|\/\*[\s\S]*?\*\/)*["']node:/)
    expect(source, name).not.toMatch(/from\s*["']node:/)
  }
})

test('the built worker stands alone, so a host can serve it beside the wasm only', async () => {
  const source = await readFile(new URL('../dist/worker.mjs', import.meta.url), 'utf8')
  const specifiers = [
    ...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g),
  ].map((m) => m[1])
  expect(specifiers).toEqual([])
})

test("the built files leave the glue's Node import invisible to a browser bundler", async () => {
  const names = (await readdir(new URL('../dist/', import.meta.url))).filter((file) =>
    file.endsWith('.mjs')
  )
  for (const name of names) {
    const source = await readFile(new URL(`../dist/${name}`, import.meta.url), 'utf8')
    expect(source, name).not.toMatch(/import\((?:\s|\/\*[\s\S]*?\*\/)*["']module["']/)
    expect(source, name).not.toMatch(/from\s*["']module["']/)
  }
  // Node still gets the module through the glue's own branch.
  const index = await readFile(new URL('../dist/index.mjs', import.meta.url), 'utf8')
  expect(index).toContain('process.getBuiltinModule("module")')
})

test('the built package names its worker in one literal URL, inside the Worker call', async () => {
  // A bundler copies every literal `new URL('./…', import.meta.url)` as an asset, beside the
  // worker it bundles from the `new Worker(...)` form, so any other would ship a second copy.
  const source = await readFile(new URL('../dist/index.mjs', import.meta.url), 'utf8')
  const literals = source.match(/new URL\(\s*["'`]\.\/worker\.mjs["'`]/g) ?? []
  expect(literals).toHaveLength(1)
})

test('the package is published with the wasm, the worker, the types and the notices', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  ) as { private?: boolean; engines?: Record<string, string> }
  expect(manifest.private).toBeUndefined()
  // The built entry reads its wasm through `process.getBuiltinModule`, new in Node 22.3.
  expect(manifest.engines).toEqual({ node: '>=22.3' })

  const [packed] = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
    })
  ) as [{ files: { path: string }[] }]
  const files = packed.files.map((f) => f.path).filter((path) => !path.endsWith('.map'))
  expect(files.sort()).toEqual(
    [
      'LICENSE',
      'README.md',
      'package.json',
      'dist/THIRD-PARTY-NOTICES',
      'dist/index.d.mts',
      // The PDFium glue is bundled into both entry points.
      'dist/index.mjs',
      'dist/inkbar-pdfium.wasm',
      'dist/worker.d.mts',
      'dist/worker.mjs',
    ].sort()
  )
})
