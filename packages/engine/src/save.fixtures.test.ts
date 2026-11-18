import { readFile } from 'node:fs/promises'

import { fixtureBytes, manifest, type FixtureName } from '@inkbar/fixtures'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createEngine, EngineError, type Engine } from './index.ts'
import { qpdfAvailable, qpdfCheck, requireQpdfInCi } from './qpdf.testing.ts'

import type { SaveMode } from './types.ts'

const MODES: SaveMode[] = ['rewrite', 'incremental']

let engine: Engine

beforeAll(async () => {
  engine = await createEngine({
    wasm: await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url)),
    worker: false,
  })
  requireQpdfInCi()
})

afterAll(async () => {
  await engine.destroy()
})

async function pdfjsPageCount(saved: Uint8Array, password?: string): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // Verbosity 0: pdf.js reports errors only, not its recovery warnings for broken fixtures.
  const task = pdfjs.getDocument({ data: new Uint8Array(saved), password, verbosity: 0 })
  try {
    return (await task.promise).numPages
  } finally {
    await task.destroy()
  }
}

const openable = Object.entries(manifest).filter(([, meta]) => meta.opens) as [
  FixtureName,
  (typeof manifest)[FixtureName],
][]

type Meta = (typeof manifest)[FixtureName]
const openOptions = (meta: Meta) => (meta.password ? { password: meta.password } : {})

/** Saves the fixture and reopens the result with the engine and PDF.js. Throws on any failure. */
async function saveAndReopen(name: FixtureName, meta: Meta, mode: SaveMode) {
  const doc = await engine.open(await fixtureBytes(name), openOptions(meta))
  try {
    const saved = await doc.save({ mode })
    const again = await engine.open(saved, openOptions(meta))
    const pages = again.pageCount
    await again.close()
    expect(pages).toBe(meta.pages)
    expect(await pdfjsPageCount(saved, meta.password)).toBe(meta.pages)
    return saved
  } finally {
    await doc.close()
  }
}

describe.each(openable)('%s', (name, meta) => {
  test(
    meta.engine?.open
      ? `${name} fails to open as recorded: ${meta.engine.open}`
      : `${name} opens`,
    async () => {
      const opened = engine.open(await fixtureBytes(name), openOptions(meta))
      if (meta.engine?.open) {
        await expect(opened).rejects.toBeInstanceOf(EngineError)
      } else {
        await (await opened).close()
      }
    }
  )

  describe.each(MODES)('save (%s)', (mode) => {
    const recorded =
      mode === 'rewrite' ? meta.engine?.saveRewrite : meta.engine?.saveIncremental
    let saved: Uint8Array | undefined
    let failure: unknown

    beforeAll(async () => {
      try {
        saved = await saveAndReopen(name, meta, mode)
      } catch (error) {
        failure = error
      }
    })

    test(
      recorded
        ? `${name} save (${mode}) fails as recorded: ${recorded}`
        : `${name} saves (${mode}) and reopens`,
      () => {
        if (recorded) {
          // An EngineError, or a failed assertion from a reader check; not a harness error.
          expect(failure).toBeDefined()
          const kind =
            failure instanceof EngineError
              ? 'EngineError'
              : failure instanceof Error && failure.name === 'AssertionError'
                ? 'AssertionError'
                : String(failure)
          expect(['EngineError', 'AssertionError']).toContain(kind)
        } else {
          expect(failure).toBeUndefined()
        }
      }
    )

    test.skipIf(!qpdfAvailable || recorded !== undefined)(
      `${name} save (${mode}) passes qpdf --check`,
      async () => {
        expect(saved).toBeDefined()
        expect(await qpdfCheck(saved as Uint8Array, meta.password)).toEqual({ ok: true })
      }
    )
  })
})

describe.each(['encrypted-aes', 'encrypted-rc4'] as const)('%s', (name) => {
  test.each(MODES)('a file saved (%s) still needs the password', async (mode) => {
    const password = manifest[name].password
    const doc = await engine.open(await fixtureBytes(name), password ? { password } : {})
    let saved: Uint8Array
    try {
      saved = await doc.save({ mode })
    } finally {
      await doc.close()
    }
    await expect(engine.open(saved)).rejects.toMatchObject({ code: 'password-required' })
  })
})
