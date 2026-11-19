import { readFile } from 'node:fs/promises'

import { fixtureBytes, manifest } from '@inkbar/fixtures'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'

import { EngineCore } from './core.ts'
import { loadNative } from './module.ts'

let core: EngineCore

beforeAll(async () => {
  const native = await loadNative({
    wasm: await readFile(new URL('../../vendor/inkbar-pdfium.wasm', import.meta.url)),
  })
  core = new EngineCore(native)
})

afterEach(() => {
  expect(core.openCount).toBe(0)
})

afterAll(() => {
  core.destroy()
})

describe.each(Object.entries(manifest))('%s', (name, meta) => {
  const options = meta.password ? { password: meta.password } : {}
  let bytes: Uint8Array
  beforeAll(async () => {
    bytes = await fixtureBytes(name as keyof typeof manifest)
  })

  if (!meta.opens) {
    test('is rejected as invalid', () => {
      expect(() => core.open(bytes)).toThrow(
        expect.objectContaining({ code: 'invalid-pdf' })
      )
    })
    return
  }

  if (meta.password) {
    test('needs its password', () => {
      expect(() => core.open(bytes)).toThrow(
        expect.objectContaining({ code: 'password-required' })
      )
      expect(() => core.open(bytes, { password: 'wrong' })).toThrow(
        expect.objectContaining({ code: 'password-incorrect' })
      )
    })
  }

  test('opens with the manifest page count', () => {
    const { id, pageCount } = core.open(bytes, options)
    core.close(id)
    expect(pageCount).toBe(meta.pages)
  })

  test('renders its first page at the expected size, not blank', () => {
    const { id } = core.open(bytes, options)
    try {
      const info = core.pageInfo(id, 0)
      const turned = info.rotation === 90 || info.rotation === 270
      const page = core.renderPage(id, 0, 1)
      expect(page.width).toBe(Math.ceil(turned ? info.height : info.width))
      expect(page.height).toBe(Math.ceil(turned ? info.width : info.height))
      expect(page.data.length).toBe(page.width * page.height * 4)
      // A recorded difference is a blank page where PDF.js draws content: when the engine draws
      // it, the test fails and the note in the manifest goes.
      expect(page.data.some((v, i) => i % 4 !== 3 && v !== 255)).toBe(
        meta.engine?.render === undefined
      )
      expect(page.data.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true)
    } finally {
      core.close(id)
    }
  })
})
