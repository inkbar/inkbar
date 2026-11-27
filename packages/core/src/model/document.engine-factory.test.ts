// A test can supply the engine a document uses: while a factory is set it makes every engine,
// in place of the one core starts from the assets.
import { fixtureBytes } from '@inkbar/fixtures'
import { afterEach, expect, it, vi } from 'vitest'

import { heldEngines } from '../test-support/held-engines'
import { nodeAssets } from '../test-support/node-assets'

import { openDocument } from './document'
import { setEngineFactory } from './engine-factory'

afterEach(() => {
  setEngineFactory(undefined)
})

/** Assets whose engine binary does not exist: an open that starts the real engine fails. */
const noEngine = () => ({ ...nodeAssets(), engine: '/nowhere/inkbar-pdfium.wasm' })

it('starts the reader from the factory and not from the assets', async () => {
  const held = heldEngines()
  const factory = vi.fn(held.factory)
  setEngineFactory(factory)
  const doc = await openDocument(await fixtureBytes('text-simple'), {
    assets: noEngine(),
  })
  await doc.ready
  expect(factory).toHaveBeenCalledOnce()
  expect(held.engines).toHaveLength(1)
  doc.destroy()
})

it('passes on what a failing factory rejects with as the open fails', async () => {
  const refused = new Error('factory engine refused')
  setEngineFactory(() => Promise.reject(refused))
  const doc = await openDocument(await fixtureBytes('text-simple'), {
    assets: nodeAssets(),
  })
  await expect(doc.ready).rejects.toMatchObject({
    code: 'AssetLoadFailed',
    details: { cause: refused },
  })
})

it('starts the engine from the assets once cleared', async () => {
  setEngineFactory(() => Promise.reject(new Error('factory engine refused')))
  setEngineFactory(undefined)
  const doc = await openDocument(await fixtureBytes('text-simple'), {
    assets: noEngine(),
  })
  await expect(doc.ready).rejects.toMatchObject({ code: 'AssetLoadFailed' })
  const ok = await openDocument(await fixtureBytes('text-simple'), {
    assets: nodeAssets(),
  })
  await ok.ready
  ok.destroy()
})
