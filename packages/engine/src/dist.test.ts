import { execFileSync } from 'node:child_process'
import { access, readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { fixtureBytes } from '@inkbar/fixtures'
import { expect, test } from 'vitest'

import type { createEngine as CreateBareEngine } from './bare.ts'
import type { createEngine as CreateEngine } from './index.ts'

// The worker gzips to about 30,700 bytes minified, and to about 51,800 bytes unminified.
const WORKER_GZIP_LIMIT = 34_000

// Runs against the built package; turbo builds it before `test`.
test('the built package finds its own wasm and opens a document', async () => {
  const built = new URL('../dist/index.mjs', import.meta.url)
  await access(built).catch(() => {
    throw new Error('dist/index.mjs is missing: build the package first (pnpm build)')
  })
  const { createEngine, TEXT_GEOMETRY_STRIDE } = (await import(built.href)) as {
    createEngine: typeof CreateEngine
    TEXT_GEOMETRY_STRIDE: number
  }
  const engine = await createEngine({ worker: false })
  try {
    const doc = await engine.open(await fixtureBytes('text-simple'))
    expect(doc.pageCount).toBe(3)
    const text = await doc.pageText(0)
    expect(text.count).toBeGreaterThan(0)
    expect(text.geometry.length).toBe(text.count * TEXT_GEOMETRY_STRIDE)
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

test('the built worker is minified, since a host serves it as it is and loads it at every open', async () => {
  const source = await readFile(new URL('../dist/worker.mjs', import.meta.url))
  expect(gzipSync(source).byteLength).toBeLessThan(WORKER_GZIP_LIMIT)
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
  // The glue sits in the chunk the index and bare entries share.
  const chunk = names.find((name) => name.startsWith('engine-')) as string
  const glue = await readFile(new URL(`../dist/${chunk}`, import.meta.url), 'utf8')
  expect(glue).toContain('process.getBuiltinModule("module")')
})

test('the built package names its worker in one literal URL, inside the Worker call', async () => {
  // A bundler copies every literal `new URL('./…', import.meta.url)` as an asset, beside the
  // worker it bundles from the `new Worker(...)` form, so any other would ship a second copy.
  const source = await readFile(new URL('../dist/index.mjs', import.meta.url), 'utf8')
  const literals = source.match(/new URL\(\s*["'`]\.\/worker\.mjs["'`]/g) ?? []
  expect(literals).toHaveLength(1)
})

test('the built bare entry and every chunk it imports name no default wasm or worker', async () => {
  // A bundler copies each literal `new URL('./…', import.meta.url)`, so a host that passes its
  // own files would otherwise carry the binary twice.
  const dist = new URL('../dist/', import.meta.url)
  const seen = new Set<string>()
  const queue = ['bare.mjs']
  while (queue.length > 0) {
    const name = queue.pop() as string
    if (seen.has(name)) continue
    seen.add(name)
    const source = await readFile(new URL(name, dist), 'utf8')
    expect(source, name).not.toMatch(
      /new URL\(\s*["'`][^"'`]*(?:inkbar-pdfium\.wasm|worker\.mjs)/
    )
    for (const m of source.matchAll(/\bfrom\s*["']\.\/([^"']+)["']/g))
      queue.push(m[1] as string)
  }
  expect(seen.has('worker.mjs')).toBe(false)
})

test('the built bare entry opens a document when given its wasm', async () => {
  const { createEngine } = (await import(
    new URL('../dist/bare.mjs', import.meta.url).href
  )) as {
    createEngine: typeof CreateBareEngine
  }
  const wasm = await readFile(new URL('../dist/inkbar-pdfium.wasm', import.meta.url))
  const engine = await createEngine({ wasm, worker: false })
  try {
    expect((await engine.open(await fixtureBytes('text-simple'))).pageCount).toBe(3)
  } finally {
    await engine.destroy()
  }
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
  // The index and bare entries share chunks, whose names carry a content hash.
  const files = packed.files
    .map((f) => f.path)
    .filter((path) => !path.endsWith('.map'))
    .map((path) =>
      path.replace(
        /-[\w-]{8}\.(d\.)?mjs$|-[\w-]{8}\.d\.mts$/,
        (m) => `-HASH${m.slice(9)}`
      )
    )
  expect(files.sort()).toEqual(
    [
      'LICENSE',
      'README.md',
      'package.json',
      'dist/THIRD-PARTY-NOTICES',
      'dist/bare.d.mts',
      'dist/bare.mjs',
      'dist/engine-HASH.mjs',
      'dist/index.d.mts',
      'dist/public-HASH.d.mts',
      // The index and bare entries share engine-HASH.mjs, which holds the PDFium glue.
      'dist/index.mjs',
      'dist/inkbar-pdfium.wasm',
      'dist/worker.d.mts',
      'dist/worker.mjs',
    ].sort()
  )
})
