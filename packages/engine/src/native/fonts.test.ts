import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { fixtureBytes, manifest, type FixtureName } from '@inkbar/fixtures'
import { beforeAll, expect, test } from 'vitest'

import { keysOf } from '../fonts.ts'

import { EngineCore } from './core.ts'
import { pageNeeds, registerFont, takeMisses } from './fonts.ts'
import { loadNative, type NativeModule } from './module.ts'

import type { Heap } from './strings.ts'

const UNEMBEDDED = [
  'unembedded-japanese',
  'unembedded-simplified-chinese',
  'unembedded-traditional-chinese',
  'unembedded-korean',
  'unembedded-cyrillic',
  'unembedded-greek',
  'unembedded-arial',
] as const satisfies FixtureName[]

let wasm: Uint8Array
let japanese: Uint8Array

beforeAll(async () => {
  wasm = await readFile(new URL('../../vendor/inkbar-pdfium.wasm', import.meta.url))
  const file = createRequire(import.meta.url).resolve(
    '@inkbar/fonts/files/NotoSansJP-Regular.otf'
  )
  japanese = new Uint8Array(await readFile(file))
})

const heapOf = (native: NativeModule): Heap => ({
  fn: native.fn,
  native,
  stopped: false,
})

/** Loads a fixture straight into the module, for the calls that take a document handle. */
function loadDoc(native: NativeModule, bytes: Uint8Array): number {
  const data = native.fn.malloc(bytes.length)
  native.HEAPU8.set(bytes, data)
  const doc = native.fn.FPDF_LoadMemDocument64(data, bytes.length, 0)
  expect(doc).not.toBe(0)
  return doc
}

test('each fixture page needs the keys its manifest entry lists', async () => {
  const native = await loadNative({ wasm })
  new EngineCore(native)
  const heap = heapOf(native)
  for (const name of UNEMBEDDED) {
    const doc = loadDoc(native, await fixtureBytes(name))
    expect(keysOf(pageNeeds(heap, doc, 0)), name).toEqual(manifest[name].unembedded)
    native.fn.FPDF_CloseDocument(doc)
  }
  expect(pageNeeds(heap, 0, 0)).toBe(0)
})

test('a font is registered from its bytes; empty bytes are refused', async () => {
  const native = await loadNative({ wasm })
  new EngineCore(native)
  const heap = heapOf(native)
  expect(registerFont(heap, 'korean', new Uint8Array())).toBe(false)
  expect(registerFont(heap, 'japanese', japanese)).toBe(true)
})

test('drawing a page that needs an unregistered key logs a miss, once', async () => {
  const native = await loadNative({ wasm })
  const core = new EngineCore(native)
  const heap = heapOf(native)
  takeMisses(heap)
  const { id } = core.open(await fixtureBytes('unembedded-japanese'))
  core.renderPage(id, 0)
  expect(keysOf(takeMisses(heap))).toEqual(['japanese'])
  expect(takeMisses(heap)).toBe(0)
})

test('a registered key is not missed', async () => {
  const native = await loadNative({ wasm })
  const core = new EngineCore(native)
  const heap = heapOf(native)
  expect(registerFont(heap, 'japanese', japanese)).toBe(true)
  takeMisses(heap)
  const { id } = core.open(await fixtureBytes('unembedded-japanese'))
  core.renderPage(id, 0)
  expect(takeMisses(heap)).toBe(0)
})
