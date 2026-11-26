// Opening every fixture: the InkError code the open ends with, or a ready document with the
// manifest's page count and the encrypted flag the file has.
import { FIXTURE_NAMES, fixtureBytes, manifest, type FixtureName } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import { nodeAssets } from '../test-support/node-assets'

import { openDocument } from './document'
import { isInkError } from './errors'

/** How an open ended, as a host sees it. */
interface Outcome {
  code: string
  pageCount?: number
  isEncrypted: boolean
  incorrect?: unknown
}

/** Opens `bytes` and says how it ended. */
async function outcome(
  bytes: Uint8Array,
  password: string | undefined,
  assets = nodeAssets()
): Promise<Outcome> {
  const doc = await openDocument(bytes, {
    assets,
    ...(password === undefined ? {} : { password }),
  })
  try {
    await doc.ready
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

/** Fixtures that are encrypted but open with no password. */
const ENCRYPTED_OPEN: ReadonlySet<FixtureName> = new Set<FixtureName>([
  'callout-encrypted',
  'signed-encrypted',
  'form-restricted',
])

describe('opening with the engine', () => {
  it.each(FIXTURE_NAMES)(
    'ends as the manifest says, on %s',
    async (name) => {
      const bytes = await fixtureBytes(name)
      const { password, opens, pages } = manifest[name]
      const ended = await outcome(bytes, password)
      expect(ended).toEqual(
        opens
          ? {
              code: 'ready',
              pageCount: pages,
              isEncrypted: password !== undefined || ENCRYPTED_OPEN.has(name),
            }
          : { code: 'InvalidPdf', isEncrypted: false }
      )
    },
    60_000
  )

  const encrypted = FIXTURE_NAMES.filter((name) => manifest[name].password !== undefined)

  it.each(encrypted)(
    'asks for the password of %s, and says when the one given is wrong',
    async (name) => {
      const bytes = await fixtureBytes(name)
      expect(await outcome(bytes, undefined)).toEqual({
        code: 'PasswordRequired',
        isEncrypted: true,
        incorrect: false,
      })
      expect(await outcome(bytes, 'not the password')).toEqual({
        code: 'PasswordRequired',
        isEncrypted: true,
        incorrect: true,
      })
      // An empty password is no password: the file still asks for one.
      expect(await outcome(bytes, '')).toEqual({
        code: 'PasswordRequired',
        isEncrypted: true,
        incorrect: false,
      })
    }
  )

  it('gives InvalidPdf for bytes that are not a PDF, with the engine code and message', async () => {
    const doc = await openDocument(new TextEncoder().encode('not a PDF at all'), {
      assets: nodeAssets(),
    })
    await expect(doc.ready).rejects.toMatchObject({
      code: 'InvalidPdf',
      details: { engineCode: 'invalid-pdf', engineMessage: expect.any(String) as string },
    })
  })

  it('gives AssetLoadFailed, with the cause, when the engine binary cannot be read', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: { ...nodeAssets(), engine: '/nowhere/inkbar-pdfium.wasm' },
    })
    await expect(doc.ready).rejects.toMatchObject({
      code: 'AssetLoadFailed',
      details: { cause: expect.anything() as unknown },
    })
    expect(doc.status.get()).toMatchObject({
      state: 'error',
      error: { code: 'AssetLoadFailed' },
    })
  })

  it('reads the engine binary from a file URL', async () => {
    const assets = nodeAssets()
    const { pathToFileURL } = await import('node:url')
    expect(
      await outcome(await fixtureBytes('text-simple'), undefined, {
        ...assets,
        engine: pathToFileURL(assets.engine).href,
      })
    ).toMatchObject({ code: 'ready' })
  })

  it('ignores the worker in Node, where the engine runs in this thread', async () => {
    expect(
      await outcome(await fixtureBytes('text-simple'), undefined, {
        ...nodeAssets(),
        worker: '/nowhere/worker.mjs',
      })
    ).toMatchObject({ code: 'ready' })
  })
})
