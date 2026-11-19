import { fixtureBytes } from '@inkbar/fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument } from './document'

import type { EngineLoader } from './save/saver'

const evaluated = vi.hoisted(() => ({ engineReader: false }))

// The factory only runs when something actually imports the engine reader.
vi.mock(import('../engine-reader/reader'), async (original) => {
  evaluated.engineReader = true
  return original()
})

const flag = globalThis as { __INKBAR_READER__?: unknown }

afterEach(() => {
  delete flag.__INKBAR_READER__
})

const open = async (engine: EngineLoader) => {
  const doc = await openDocument(await fixtureBytes('text-simple'), {
    assets: nodeAssets(),
    engine,
  })
  await doc.ready
  return doc
}

describe('the reader a document opens with', () => {
  it('with the switch off: PDF.js, and neither the engine reader nor the engine is loaded', async () => {
    const loader = vi.fn<EngineLoader>(() => import('@inkbar/engine'))
    const doc = await open(loader)
    expect(doc._reader.kind).toBe('pdfjs')
    expect(loader).not.toHaveBeenCalled()
    expect(evaluated.engineReader).toBe(false)
    doc.destroy()
  })

  // Control: the same mock fires once the switch is on, so the false above is meaningful.
  it('with the switch on: the engine reader, over the engine the host loads', async () => {
    flag.__INKBAR_READER__ = 'engine'
    const loader = vi.fn<EngineLoader>(() => import('@inkbar/engine'))
    const doc = await open(loader)
    expect(doc._reader.kind).toBe('engine')
    expect(loader).toHaveBeenCalledTimes(1)
    expect(evaluated.engineReader).toBe(true)
    expect(doc.pages).toHaveLength(3)
    doc.destroy()
  })
})
