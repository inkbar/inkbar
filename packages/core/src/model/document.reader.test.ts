import { fixtureBytes } from '@inkbar/fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { expectSameLinks, linksAsSeen } from '../engine-reader/test-utils'
import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument, type InkDocument } from './document'

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

  it('with the switch on: the same words, links, outline and destinations as with it off', async () => {
    const read = async (name: 'links' | 'outline') => {
      const doc = await openDocument(await fixtureBytes(name), {
        assets: nodeAssets(),
        engine: () => import('@inkbar/engine'),
      })
      await doc.ready
      const out = {
        kind: doc._reader.kind,
        // With the switch on the engine reads the text: its boxes come from the engine's
        // character boxes and its font names are the fonts' own, so the words are compared.
        text: (await doc.text(0)).items.map(({ str, dir, fontSize }) => ({
          str,
          dir,
          fontSize,
        })),
        // Explicit destinations are compared by where they go: see linksAsSeen.
        links: await linksAsSeen(doc, 0),
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
      expectSameLinks(on.links, off.links)
      expect({ ...on, links: [] }).toEqual({ ...off, kind: 'engine', links: [] })
    }
  })
})

/**
 * The real engine, wrapped: the first engine stops when the open reads page `stopAt`'s links,
 * so every later call on it fails as on a stopped engine, and no other engine starts.
 */
function stopsThenCannotStart(stopAt: number) {
  let stopped = false
  const stoppedError = () =>
    Object.assign(new Error('stopped'), { code: 'engine-failure' })
  const createEngine = vi.fn(async () => {
    if (createEngine.mock.calls.length > 1) throw new Error('no engine')
    const real = await import('@inkbar/engine')
    const engine = await real.createEngine()
    return new Proxy(engine, {
      get(target, key, receiver) {
        if (key !== 'open') return Reflect.get(target, key, receiver) as unknown
        return async (...args: Parameters<typeof engine.open>) => {
          const doc = await target.open(...args)
          return new Proxy(doc, {
            get(d, name, r) {
              const value = Reflect.get(d, name, r) as unknown
              if (typeof value !== 'function' || name === 'close') return value
              return (...a: unknown[]) => {
                if (name === 'pageLinks' && a[0] === stopAt) stopped = true
                if (stopped) return Promise.reject(stoppedError())
                return (value as (...b: unknown[]) => unknown).apply(d, a)
              }
            },
          })
        }
      },
    })
  })
  const loader = (() => Promise.resolve({ createEngine })) as unknown as EngineLoader
  return { loader, createEngine }
}

describe('lookups that fail', () => {
  it('a destination lookup PDF.js cannot do is an answer: asked once, for nothing', async () => {
    const doc = await openDocument(await fixtureBytes('outline'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const spy = vi.spyOn(doc._pdfjs.proxy, 'getDestination')
    spy.mockRejectedValue(new Error('unreadable name tree'))
    for (let i = 0; i < 3; i++)
      await expect(doc.resolveDestination('chapter-2')).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
    // A reference that is not a page: PDF.js rejects, every time, and is asked once.
    const pageIndex = vi.spyOn(doc._pdfjs.proxy, 'getPageIndex')
    const catalog = [{ num: 1, gen: 0 }, { name: 'Fit' }]
    for (let i = 0; i < 3; i++)
      await expect(doc.resolveDestination(catalog)).resolves.toBeUndefined()
    expect(pageIndex).toHaveBeenCalledTimes(1)
    doc.destroy()
  })

  it('an outline read that fails gives [] and is read again; one that succeeds is kept', async () => {
    const doc = await openDocument(await fixtureBytes('outline'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const spy = vi.spyOn(doc._pdfjs.proxy, 'getOutline')
    spy.mockRejectedValueOnce(new Error('unreadable outline'))
    await expect(doc.outline()).resolves.toEqual([])
    const read = await doc.outline()
    expect(read.map((i) => i.title)).toContain('Appendix')
    await expect(doc.outline()).resolves.toBe(read)
    expect(spy).toHaveBeenCalledTimes(2)
    doc.destroy()
  })

  it('a file with no outline is read once', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const spy = vi.spyOn(doc._pdfjs.proxy, 'getOutline')
    await expect(doc.outline()).resolves.toEqual([])
    await expect(doc.outline()).resolves.toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
    doc.destroy()
  })
})

describe('an engine that cannot start halfway through an open', () => {
  it('text, links, the outline and destinations come from PDF.js, and no engine is started again', async () => {
    const read = async (engine: EngineLoader) => {
      const doc = await openDocument(await fixtureBytes('outline'), {
        assets: nodeAssets(),
        engine,
      })
      await doc.ready
      return doc
    }
    const plain = await read(() => import('@inkbar/engine'))
    expect(plain._reader.kind).toBe('pdfjs')

    flag.__INKBAR_READER__ = 'engine'
    const { loader, createEngine } = stopsThenCannotStart(3)
    const doc = await read(loader)
    expect(doc._reader.kind).toBe('engine')
    // The engine the file opened in, and the one that could not replace it.
    expect(createEngine).toHaveBeenCalledTimes(2)
    for (let round = 0; round < 2; round++) {
      for (let page = 0; page < doc.pages.length; page++) {
        // PDF.js names a loaded font after its document, so the names differ between the two.
        const items = async (d: InkDocument) =>
          (await d.text(page)).items.map(({ fontName: _fontName, ...rest }) => rest)
        expect(await items(doc)).toEqual(await items(plain))
        expectSameLinks(await linksAsSeen(doc, page), await linksAsSeen(plain, page))
      }
      expect(await doc.outline()).toEqual(await plain.outline())
      // The document keeps the outline and each name's answer, so each round asks the reader
      // itself: the outline, and names not asked before.
      expect(await doc._reader.outline()).toEqual(await plain.outline())
      const names = round === 0 ? ['chapter-2', 'no-such-name'] : ['appendix', 'nowhere']
      for (const name of names) {
        expect(await doc.resolveDestination(name)).toEqual(
          await plain.resolveDestination(name)
        )
        expect(await doc._reader.resolveDestination(name)).toEqual(
          await plain.resolveDestination(name)
        )
      }
    }
    expect(createEngine).toHaveBeenCalledTimes(2)
    doc.destroy()
    plain.destroy()
  })
})
