// Opening every fixture with the engine and with PDF.js: the same InkError code, or a ready
// document with the same page count and the same encrypted flag. Where the two disagree on a
// file, the difference is listed in EXCEPTIONS with its cause.
import { FIXTURE_NAMES, fixtureBytes, manifest, type FixtureName } from '@inkbar/fixtures'
import { afterEach, describe, expect, it } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument } from './document'
import { isInkError } from './errors'

import type { EngineLoader } from './save/saver'

const flag = globalThis as { __INKBAR_READER__?: unknown }

afterEach(() => {
  delete flag.__INKBAR_READER__
})

const engine: EngineLoader = () => import('@inkbar/engine')

/** How an open ended, as a host sees it. */
interface Outcome {
  code: string
  pageCount?: number
  isEncrypted: boolean
  incorrect?: unknown
}

/** Opens `bytes` with the switch as `kind` asks and says how it ended. */
async function outcome(
  kind: 'pdfjs' | 'engine',
  bytes: Uint8Array,
  password: string | undefined
): Promise<Outcome> {
  if (kind === 'engine') flag.__INKBAR_READER__ = 'engine'
  else delete flag.__INKBAR_READER__
  const doc = await openDocument(bytes, {
    assets: nodeAssets(),
    engine,
    // PDF.js's warnings about the files are not this test's subject.
    verbosity: 0,
    ...(password === undefined ? {} : { password }),
  })
  delete flag.__INKBAR_READER__
  try {
    await doc.ready
    expect(doc._reader.kind).toBe(kind)
    return {
      code: 'ready',
      pageCount: doc.info.pageCount,
      isEncrypted: doc.info.isEncrypted,
    }
  } catch (error) {
    if (!isInkError(error)) throw error
    return {
      code: error.code,
      isEncrypted: doc.info.isEncrypted,
      ...(error.code === 'PasswordRequired' && { incorrect: error.details.incorrect }),
    }
  } finally {
    doc.destroy()
  }
}

/**
 * Files the engine and PDF.js open differently, each with the cause. A listed file must still
 * differ, so the list is kept to what is true.
 */
const EXCEPTIONS: Partial<Record<FixtureName, { engine: Outcome; cause: string }>> = {}

describe('opening with the engine', () => {
  it.each(FIXTURE_NAMES)(
    'ends as opening with PDF.js does, on %s',
    async (name) => {
      const bytes = await fixtureBytes(name)
      const { password } = manifest[name]
      const pdfjs = await outcome('pdfjs', bytes, password)
      const withEngine = await outcome('engine', bytes, password)
      // The manifest's verdict holds for PDF.js.
      expect(pdfjs.code === 'ready', 'opens, as the manifest says').toBe(
        manifest[name].opens
      )
      const exception = EXCEPTIONS[name]
      if (exception) {
        expect(withEngine, exception.cause).toEqual(exception.engine)
        expect(withEngine, `${exception.cause} still shows`).not.toEqual(pdfjs)
        return
      }
      expect(withEngine).toEqual(pdfjs)
    },
    60_000
  )

  const encrypted = FIXTURE_NAMES.filter((name) => manifest[name].password !== undefined)

  it.each(encrypted)(
    'asks for the password of %s, and says when the one given is wrong',
    async (name) => {
      const bytes = await fixtureBytes(name)
      for (const kind of ['pdfjs', 'engine'] as const) {
        expect(await outcome(kind, bytes, undefined), kind).toEqual({
          code: 'PasswordRequired',
          isEncrypted: true,
          incorrect: false,
        })
        expect(await outcome(kind, bytes, 'not the password'), kind).toEqual({
          code: 'PasswordRequired',
          isEncrypted: true,
          incorrect: true,
        })
        // An empty password is no password: the file still asks for one.
        expect(await outcome(kind, bytes, ''), kind).toEqual({
          code: 'PasswordRequired',
          isEncrypted: true,
          incorrect: false,
        })
      }
    }
  )

  it('gives InvalidPdf for bytes that are not a PDF, with the engine code and message', async () => {
    flag.__INKBAR_READER__ = 'engine'
    const doc = await openDocument(new TextEncoder().encode('not a PDF at all'), {
      assets: nodeAssets(),
      engine,
    })
    await expect(doc.ready).rejects.toMatchObject({
      code: 'InvalidPdf',
      details: { engineCode: 'invalid-pdf', engineMessage: expect.any(String) as string },
    })
    expect(doc._pdfjs).toBeUndefined()
  })

  it('gives EngineUnavailable, with the cause, when the loader rejects', async () => {
    flag.__INKBAR_READER__ = 'engine'
    const offline = new Error('offline')
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
      engine: () => Promise.reject(offline),
    })
    await expect(doc.ready).rejects.toMatchObject({
      code: 'EngineUnavailable',
      details: { cause: offline },
    })
    expect(doc.status.get()).toMatchObject({ state: 'error' })
  })

  it('gives EngineUnavailable when the engine cannot start', async () => {
    flag.__INKBAR_READER__ = 'engine'
    const noWasm = new Error('no wasm')
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
      engine: () => Promise.resolve({ createEngine: () => Promise.reject(noWasm) }),
    })
    await expect(doc.ready).rejects.toMatchObject({
      code: 'EngineUnavailable',
      details: { cause: noWasm },
    })
  })
})
