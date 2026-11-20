import { readFile } from 'node:fs/promises'

import { fixtureBytes } from '@inkbar/fixtures'
import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'

import { EngineCore } from './core.ts'
import { loadNative, type NativeModule } from './module.ts'

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let native: NativeModule
let core: EngineCore
let simpleBytes: Uint8Array
let rotatedBytes: Uint8Array
let simple: number
let rotated: number

beforeAll(async () => {
  native = await loadNative({
    wasm: await readFile(new URL('../../vendor/inkbar-pdfium.wasm', import.meta.url)),
  })
  simpleBytes = await fixtureBytes('text-simple')
  rotatedBytes = await fixtureBytes('text-rotated-90')
})

beforeEach(() => {
  core = new EngineCore(native)
  simple = core.open(simpleBytes).id
  rotated = core.open(rotatedBytes).id
})

afterEach(() => {
  core.destroy()
})

test('page boxes are reported before rotation', () => {
  // text-simple and text-rotated-90 are the same Letter page
  const box = { x: 0, y: 0, width: 612, height: 792 }
  expect(core.pageInfo(simple, 0)).toEqual({
    width: 612,
    height: 792,
    rotation: 0,
    box,
    userUnit: 1,
  })
  expect(core.pageInfo(rotated, 0)).toEqual({
    width: 612,
    height: 792,
    rotation: 90,
    box,
    userUnit: 1,
  })
})

test('scale multiplies the bitmap', () => {
  expect(core.renderPage(simple, 0, 2)).toMatchObject({ width: 1224, height: 1584 })
})

test('a rotated page renders in displayed orientation', () => {
  expect(core.renderPage(rotated, 0, 1)).toMatchObject({ width: 792, height: 612 })
})

test.each([new Uint8Array(0), new TextEncoder().encode('not a pdf'), PNG_HEADER])(
  'bytes that are not a PDF are invalid-pdf and leave the engine usable',
  (junk) => {
    expect(() => core.open(junk)).toThrow(
      expect.objectContaining({ code: 'invalid-pdf' })
    )
    expect(core.open(simpleBytes).pageCount).toBe(3)
  }
)

// text-simple has 3 pages, so 3 is one past the end
test.each([-1, 3, 1.5, NaN])('page index %s is a RangeError', (i) => {
  expect(() => core.pageInfo(simple, i)).toThrow(RangeError)
})

test.each([0, -1, NaN, Infinity, 1000])('scale %s is a RangeError', (s) => {
  expect(() => core.renderPage(simple, 0, s)).toThrow(RangeError)
})

test("mutating the caller's bytes after open does not change the document", () => {
  const mine = simpleBytes.slice()
  const { id } = core.open(mine)
  mine.fill(0)
  expect(core.save(id, 'rewrite').subarray(0, 5)).toEqual(
    new TextEncoder().encode('%PDF-')
  )
  expect(core.pageInfo(id, 0).width).toBe(612)
})

test('a closed document rejects every method but close', () => {
  core.close(simple)
  expect(() => core.pageInfo(simple, 0)).toThrow(
    expect.objectContaining({ code: 'engine-failure' })
  )
  expect(() => core.renderPage(simple, 0, 1)).toThrow(
    expect.objectContaining({ code: 'engine-failure' })
  )
  expect(() => core.save(simple, 'rewrite')).toThrow(
    expect.objectContaining({ code: 'engine-failure' })
  )
  expect(() => core.close(simple)).not.toThrow()
})

test('incremental save keeps the original bytes as a prefix', () => {
  const saved = core.save(simple, 'incremental')
  expect(saved.length).toBeGreaterThanOrEqual(simpleBytes.length)
  expect(saved.subarray(0, simpleBytes.length)).toEqual(simpleBytes)
})

test('destroy closes what is still open', () => {
  core.open(simpleBytes)
  core.destroy()
  expect(core.openCount).toBe(0)
})

test('opening and closing 200 times does not grow memory', () => {
  for (let i = 0; i < 20; i++) core.close(core.open(simpleBytes).id) // warm up
  const before = native.HEAPU8.length
  for (let i = 0; i < 200; i++) {
    const { id } = core.open(simpleBytes)
    core.renderPage(id, 0, 1)
    core.save(id, 'rewrite')
    core.close(id)
  }
  expect(native.HEAPU8.length).toBe(before)
})
