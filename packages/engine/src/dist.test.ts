import { access, readdir, readFile } from 'node:fs/promises'

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
