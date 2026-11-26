// The engine reader's module is loaded at the first open. When it cannot be loaded (a chunk the
// host's server no longer has, say), the open fails with EngineUnavailable.
import { fixtureBytes } from '@inkbar/fixtures'
import { expect, it, vi } from 'vitest'

import { nodeAssets } from '../test-support/node-assets'

import { openDocument } from './document'

const failed = vi.hoisted(
  () => new TypeError('Failed to fetch dynamically imported module')
)

vi.mock(import('../engine-reader/reader'), () => {
  throw failed
})

it("gives EngineUnavailable, with the cause, when the engine reader's module cannot be loaded", async () => {
  const doc = await openDocument(await fixtureBytes('text-simple'), {
    assets: nodeAssets(),
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
