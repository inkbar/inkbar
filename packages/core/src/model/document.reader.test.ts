import { fixtureBytes } from '@inkbar/fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { expectSameLinks, linksAsSeen } from '../engine-reader/test-utils'
import { nodeAssets } from '../pdfjs/node-assets'
import { drawn, FakeImageData, heldEngines } from '../test-support/held-engines'

import { openDocument, type InkDocument } from './document'
import { setEngineFactory } from './engine-factory'

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
 * The real engine, wrapped: once `trap()` is called the next call on the first engine stops it,
 * as a trap in PDFium does, so it and every later call on it fail with `engine-failure`. No
 * other engine starts.
 */
function trapsOnNextCall() {
  let trapped = false
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
                if (trapped) stopped = true
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
  return {
    loader,
    createEngine,
    trap: () => {
      trapped = true
    },
  }
}

describe('form fields', () => {
  it("with the switch on, a button's GoTo destinations go to the same pages as with it off", async () => {
    const fieldsOf = async () => {
      const doc = await openDocument(await fixtureBytes('form-goto'), {
        assets: nodeAssets(),
        engine: () => import('@inkbar/engine'),
      })
      await doc.ready
      const out = { kind: doc._reader.kind, fields: doc.form.fields.get() }
      doc.destroy()
      return out
    }
    const off = await fieldsOf()
    flag.__INKBAR_READER__ = 'engine'
    const on = await fieldsOf()
    expect([off.kind, on.kind]).toEqual(['pdfjs', 'engine'])
    expect(off.fields.length).toBeGreaterThan(0)
    expect(on.fields).toEqual(off.fields)
  })
})

describe('lookups that fail', () => {
  it('a destination lookup PDF.js cannot do is an answer: asked once, for nothing', async () => {
    const doc = await openDocument(await fixtureBytes('outline'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const spy = vi.spyOn(doc._pdfjs!.proxy, 'getDestination')
    spy.mockRejectedValue(new Error('unreadable name tree'))
    for (let i = 0; i < 3; i++)
      await expect(doc.resolveDestination('chapter-2')).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
    // A reference that is not a page: PDF.js rejects, every time, and is asked once.
    const pageIndex = vi.spyOn(doc._pdfjs!.proxy, 'getPageIndex')
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
    const spy = vi.spyOn(doc._pdfjs!.proxy, 'getOutline')
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
    const spy = vi.spyOn(doc._pdfjs!.proxy, 'getOutline')
    await expect(doc.outline()).resolves.toEqual([])
    await expect(doc.outline()).resolves.toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
    doc.destroy()
  })
})

describe('an engine that stops and cannot be started again', () => {
  it('rejects the reads waiting and every later one with EngineUnavailable; the document stays ready, with its bytes and annotations', async () => {
    flag.__INKBAR_READER__ = 'engine'
    const bytes = await fixtureBytes('links')
    const { loader, createEngine, trap } = trapsOnNextCall()
    const doc = await openDocument(bytes.slice(), {
      assets: nodeAssets(),
      engine: loader,
    })
    await doc.ready
    const openLinks = doc.links(0)
    expect(openLinks.length).toBeGreaterThan(0)
    // Page 1's text is kept for search before the engine stops.
    const word = (await doc.pageText(1)).split(/\s+/u).find((w) => w.length > 3)!
    expect(await doc.search(word, { pages: [1] }).all()).not.toEqual([])
    trap()
    const unavailable = { code: 'EngineUnavailable' }
    // Both asked before the engine is found stopped.
    const text = doc.text(0)
    const links = doc._reader.links(0)
    await expect(text).rejects.toMatchObject(unavailable)
    await expect(links).rejects.toMatchObject(unavailable)
    // And asked after: no engine is started again for them.
    await expect(doc._reader.links(0)).rejects.toMatchObject(unavailable)
    await expect(doc.text(1)).rejects.toMatchObject(unavailable)
    await expect(doc._reader.outline()).rejects.toMatchObject(unavailable)
    await expect(doc._reader.annotations(0)).rejects.toMatchObject(unavailable)
    expect(createEngine).toHaveBeenCalledTimes(2)
    expect(doc.status.get()).toEqual({ state: 'ready' })
    // What the document read at open stays.
    expect(doc.links(0)).toBe(openLinks)
    await expect(doc.getData()).resolves.toEqual(bytes)
    // A search finds nothing in the kept pages alone: it rejects as the reads do.
    await expect(doc.search(word, { pages: [1] }).all()).rejects.toMatchObject(
      unavailable
    )
    // A save with no changes needs no engine: it gives the file's bytes.
    await expect(doc.save()).resolves.toEqual(bytes)
    const added = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 1, y: 1, width: 9, height: 9 },
    })
    expect(doc.exportAnnotations('json').annotations.map((a) => a.id)).toEqual([added.id])
    await expect(doc.save()).rejects.toMatchObject(unavailable)
    doc.destroy()
  })

  it('fails the open with EngineUnavailable when the engine stops during it and cannot be started again', async () => {
    flag.__INKBAR_READER__ = 'engine'
    const { loader, trap } = trapsOnNextCall()
    trap()
    const doc = await openDocument(await fixtureBytes('outline'), {
      assets: nodeAssets(),
      engine: loader,
    })
    await expect(doc.ready).rejects.toMatchObject({ code: 'EngineUnavailable' })
    expect(doc.status.get()).toMatchObject({
      state: 'error',
      error: { code: 'EngineUnavailable' },
    })
  })
})

describe('a document whose engine is stopped', () => {
  afterEach(() => {
    setEngineFactory(undefined)
    vi.unstubAllGlobals()
  })

  const unavailable = { name: 'InkError', code: 'EngineUnavailable' }

  /**
   * text-simple, read by real engines that `held` counts. While `refuse()` returns true no new
   * engine starts.
   */
  const openHeld = async (refuse: () => boolean = () => false) => {
    flag.__INKBAR_READER__ = 'engine'
    vi.stubGlobal('ImageData', FakeImageData)
    const held = heldEngines()
    setEngineFactory(() =>
      refuse() ? Promise.reject(new Error('no engine')) : held.factory()
    )
    const bytes = await fixtureBytes('text-simple')
    const doc = await openDocument(bytes.slice(), {
      assets: nodeAssets(),
      engine: () => import('@inkbar/engine'),
    })
    await doc.ready
    return { held, doc, bytes }
  }

  /** Stops the engine under a draw, with no engine able to start again. */
  const stopEngine = async (held: ReturnType<typeof heldEngines>, doc: InkDocument) => {
    held.stopOnNext('renderPage')
    await expect(drawn(doc)).rejects.toMatchObject(unavailable)
  }

  const square = (doc: InkDocument) =>
    doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 1, y: 1, width: 9, height: 9 },
    })
  const mark = (doc: InkDocument) =>
    doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 72, y: 600, width: 200, height: 40 },
      interiorColor: '#000000',
    })

  it('with the switch off: never stopped, and a restart does nothing', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    expect(doc._reader.kind).toBe('pdfjs')
    expect(doc.engineStopped.get()).toBe(false)
    await expect(doc.restartEngine()).resolves.toBeUndefined()
    expect(doc.engineStopped.get()).toBe(false)
    doc.destroy()
  })

  it('is stopped, saves only what needs no engine, and reads again once restarted, its session untouched', async () => {
    let refuse = false
    const { held, doc, bytes } = await openHeld(() => refuse)
    const seen: boolean[] = []
    doc.engineStopped.subscribe((stopped) => seen.push(stopped))
    const added = square(doc)
    // A save with changes, then none: the file's bytes, which need no engine.
    doc.history.undo()
    refuse = true
    await stopEngine(held, doc)
    expect(doc.engineStopped.get()).toBe(true)
    expect(seen).toEqual([true])
    expect(doc.status.get()).toEqual({ state: 'ready' })
    await expect(doc.save()).resolves.toEqual(bytes)
    doc.history.redo()
    for (let i = 0; i < 2; i++)
      await expect(doc.save()).rejects.toMatchObject(unavailable)
    mark(doc)
    await expect(doc.applyRedactions()).rejects.toMatchObject(unavailable)
    const list = doc.annotations.list.get()
    expect(doc.history.canUndo.get()).toBe(true)
    // Started again: it reads, and the session is as it was.
    refuse = false
    const engines = held.engines.length
    await expect(doc.restartEngine()).resolves.toBeUndefined()
    expect(held.engines).toHaveLength(engines + 1)
    expect(doc.engineStopped.get()).toBe(false)
    expect(seen).toEqual([true, false])
    await expect(drawn(doc)).resolves.toBe(true)
    expect(doc.annotations.list.get()).toBe(list)
    expect(list.map((a) => a.id)).toContain(added.id)
    expect(doc.history.canUndo.get()).toBe(true)
    await expect(doc.save()).resolves.toBeInstanceOf(Uint8Array)
    doc.destroy()
  })

  it('stays stopped when the restart cannot start an engine', async () => {
    let refuse = false
    const { held, doc } = await openHeld(() => refuse)
    refuse = true
    await stopEngine(held, doc)
    await expect(doc.restartEngine()).rejects.toMatchObject(unavailable)
    expect(doc.engineStopped.get()).toBe(true)
    await expect(doc.text(0)).rejects.toMatchObject(unavailable)
    doc.destroy()
  })

  it('starts one engine for two restarts asked at once', async () => {
    let refuse = false
    const { held, doc } = await openHeld(() => refuse)
    refuse = true
    await stopEngine(held, doc)
    refuse = false
    const engines = held.engines.length
    await Promise.all([doc.restartEngine(), doc.restartEngine()])
    expect(held.engines).toHaveLength(engines + 1)
    doc.destroy()
  })

  it('rejects a restart the document is destroyed under, and destroys the engine it started', async () => {
    let refuse = false
    const { held, doc } = await openHeld(() => refuse)
    refuse = true
    await stopEngine(held, doc)
    refuse = false
    const engines = held.engines.length
    const restarting = doc.restartEngine()
    doc.destroy()
    await expect(restarting).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await vi.waitFor(() => expect(held.engines).toHaveLength(engines + 1))
    await vi.waitFor(() => expect(held.engines.at(-1)!.destroyed).toBe(true))
    expect(held.engines.every((e) => e.destroyed)).toBe(true)
    await expect(doc.restartEngine()).rejects.toMatchObject({ code: 'DocumentDestroyed' })
  })

  it('rejects the save that finds the engine cannot start with EngineUnavailable, and every save after', async () => {
    let refuse = false
    const { held, doc } = await openHeld(() => refuse)
    square(doc)
    held.stopOnNext('write')
    await expect(doc.save()).rejects.toMatchObject({
      code: 'SaveFailed',
      details: { stage: 'write' },
    })
    refuse = true
    await expect(doc.save()).rejects.toMatchObject(unavailable)
    expect(doc.engineStopped.get()).toBe(true)
    await expect(doc.save()).rejects.toMatchObject(unavailable)
    doc.destroy()
  })

  it('rejects the write that stops the engine a third time within 60 seconds with EngineUnavailable', async () => {
    const { held, doc } = await openHeld()
    square(doc)
    for (let i = 0; i < 2; i++) {
      held.stopOnNext('write')
      await expect(doc.save()).rejects.toMatchObject({ code: 'SaveFailed' })
      expect(doc.engineStopped.get()).toBe(false)
    }
    held.stopOnNext('write')
    await expect(doc.save()).rejects.toMatchObject(unavailable)
    expect(doc.engineStopped.get()).toBe(true)
    mark(doc)
    await expect(doc.applyRedactions()).rejects.toMatchObject(unavailable)
    doc.destroy()
  })

  it('opens the redacted file with no page blocked', async () => {
    const { held, doc } = await openHeld()
    held.stopOnEvery('pageText')
    const blocked = { ...unavailable, details: { page: 0 } }
    await expect(doc.text(0)).rejects.toMatchObject(blocked)
    held.stopOnEvery(undefined)
    await expect(doc.text(0)).rejects.toMatchObject(blocked)
    expect(doc.engineStopped.get()).toBe(false)
    mark(doc)
    const { bytes } = await doc.applyRedactions()
    const next = await openDocument(bytes, {
      assets: nodeAssets(),
      engine: () => import('@inkbar/engine'),
    })
    await next.ready
    await expect(next.text(0)).resolves.toMatchObject({ page: 0 })
    expect(next.engineStopped.get()).toBe(false)
    doc.destroy()
    next.destroy()
  })
})
