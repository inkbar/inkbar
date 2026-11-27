// A test can supply the engine a document uses: while a factory is set it makes every engine,
// whatever the `engine` option says, and a document with no option still has an engine.
import { fixtureBytes } from '@inkbar/fixtures'
import { afterEach, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument } from './document'
import { setEngineFactory } from './engine-factory'

const flag = globalThis as { __INKBAR_READER__?: unknown }

afterEach(() => {
  setEngineFactory(undefined)
  delete flag.__INKBAR_READER__
})

it('starts the reader from the factory and never calls the engine option', async () => {
  flag.__INKBAR_READER__ = 'engine'
  const stopped = new Error('factory engine refused')
  const factory = vi.fn(() => Promise.reject(stopped))
  const loader = vi.fn(() => Promise.reject(new Error('the loader was called')))
  setEngineFactory(factory)
  const doc = await openDocument(await fixtureBytes('text-simple'), {
    assets: nodeAssets(),
    engine: loader,
  })
  await expect(doc.ready).rejects.toMatchObject({ code: 'EngineUnavailable' })
  expect(factory).toHaveBeenCalled()
  expect(loader).not.toHaveBeenCalled()
})

it('counts as having an engine with no option while a factory is set', async () => {
  flag.__INKBAR_READER__ = 'engine'
  const factory = vi.fn(() => Promise.reject(new Error('factory engine refused')))
  setEngineFactory(factory)
  const doc = await openDocument(await fixtureBytes('text-simple'), {
    assets: nodeAssets(),
  })
  await expect(doc.ready).rejects.toMatchObject({ code: 'EngineUnavailable' })
  expect(factory).toHaveBeenCalled()
})

it('behaves as before once cleared', async () => {
  flag.__INKBAR_READER__ = 'engine'
  setEngineFactory(() => Promise.reject(new Error('factory engine refused')))
  setEngineFactory(undefined)
  const loader = vi.fn(() => Promise.reject(new Error('the loader was called')))
  const doc = await openDocument(await fixtureBytes('text-simple'), {
    assets: nodeAssets(),
    engine: loader,
  })
  await expect(doc.ready).rejects.toMatchObject({ code: 'EngineUnavailable' })
  expect(loader).toHaveBeenCalled()
  const bare = await openDocument(await fixtureBytes('text-simple'), {
    assets: nodeAssets(),
  })
  await expect(bare.ready).rejects.toMatchObject({
    code: 'EngineUnavailable',
    message: 'Drawing pages with the engine needs the engine option',
  })
})
