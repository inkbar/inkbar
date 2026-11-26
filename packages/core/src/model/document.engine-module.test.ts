// The engine reader's module is loaded only when the engine reads the file. When it cannot be
// loaded (a chunk the host's server no longer has, say), the open fails with EngineUnavailable,
// as when the engine itself cannot start.
import { fixtureBytes } from '@inkbar/fixtures'
import { afterEach, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument } from './document'

const failed = vi.hoisted(
  () => new TypeError('Failed to fetch dynamically imported module')
)

vi.mock(import('../engine-reader/reader'), () => {
  throw failed
})

const flag = globalThis as { __INKBAR_READER__?: unknown }

afterEach(() => {
  delete flag.__INKBAR_READER__
})

it("gives EngineUnavailable, with the cause, when the engine reader's module cannot be loaded", async () => {
  flag.__INKBAR_READER__ = 'engine'
  const doc = await openDocument(await fixtureBytes('text-simple'), {
    assets: nodeAssets(),
    engine: () => import('@inkbar/engine'),
  })
  await expect(doc.ready).rejects.toMatchObject({
    code: 'EngineUnavailable',
    details: { cause: expect.anything() as unknown },
  })
  expect(doc.status.get()).toMatchObject({
    state: 'error',
    error: { code: 'EngineUnavailable' },
  })
})
