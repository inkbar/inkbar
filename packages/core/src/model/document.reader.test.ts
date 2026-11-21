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

  it('with the switch on: text, links, the outline and destinations read as with it off', async () => {
    const read = async (name: 'links' | 'outline') => {
      const doc = await openDocument(await fixtureBytes(name), {
        assets: nodeAssets(),
        engine: () => import('@inkbar/engine'),
      })
      await doc.ready
      const out = {
        kind: doc._reader.kind,
        // PDF.js numbers font names per document, so they are left out.
        text: (await doc.text(0)).items.map(({ fontName: _, ...item }) => item),
        links: doc.links(0),
        outline: await doc.outline(),
        dest: await doc.resolveDestination('chapter-2'),
      }
      doc.destroy()
      return out
    }
    for (const name of ['links', 'outline'] as const) {
      const off = await read(name)
      flag.__INKBAR_READER__ = 'engine'
      const on = await read(name)
      delete flag.__INKBAR_READER__
      expect(off.kind).toBe('pdfjs')
      expect(on.kind).toBe('engine')
      expect(on).toEqual({ ...off, kind: 'engine' })
    }
  })
})
