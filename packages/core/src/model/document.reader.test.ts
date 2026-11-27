import { EngineError } from '@inkbar/engine'
import { fixtureBytes } from '@inkbar/fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { linksAsSeen } from '../engine-reader/test-utils'
import { openSecondReader } from '../pdfjs/second-reader'
import { drawn, FakeImageData, heldEngines } from '../test-support/held-engines'
import { nodeAssets } from '../test-support/node-assets'

import { openDocument, type InkDocument } from './document'
import { setEngineFactory } from './engine-factory'

const evaluated = vi.hoisted(() => ({ engineReader: false }))

// The factory only runs when something actually imports the engine reader.
vi.mock(import('../engine-reader/reader'), async (original) => {
  evaluated.engineReader = true
  return original()
})

describe('the reader a document opens with', () => {
  it('is the engine reader, over an engine started from the assets', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    expect(evaluated.engineReader).toBe(true)
    expect(doc.pages).toHaveLength(3)
    doc.destroy()
  })

  it('reads the words, links, outline and destinations it read before', async () => {
    for (const name of ['links', 'outline'] as const) {
      const doc = await openDocument(await fixtureBytes(name), {
        assets: nodeAssets(),
      })
      await doc.ready
      const read = {
        // The words only: boxes and font names are the engine's own.
        text: (await doc.text(0)).items.map(({ str, dir, fontSize }) => ({
          str,
          dir,
          fontSize,
        })),
        // Explicit destinations by where they go: see linksAsSeen.
        links: await linksAsSeen(doc, 0),
        outline: await doc.outline(),
        dest: await doc.resolveDestination('chapter-2'),
      }
      doc.destroy()
      expect(read, name).toMatchSnapshot()
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
  return {
    createEngine,
    trap: () => {
      trapped = true
    },
  }
}

/**
 * Real engines, in this thread, of which a call `traps(method, args)` picks stops the engine it
 * runs on: it and every later call there reject with `engine-failure`, as after a trap in PDFium.
 */
function trapsOn(traps: (method: string, args: unknown[]) => boolean) {
  const stoppedError = () =>
    Object.assign(new Error('stopped'), { code: 'engine-failure' })
  const createEngine = vi.fn(async () => {
    const real = await import('@inkbar/engine')
    const engine = await real.createEngine({ worker: false })
    let stopped = false
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
                if (traps(String(name), a)) stopped = true
                if (stopped) return Promise.reject(stoppedError())
                return (value as (...b: unknown[]) => unknown).apply(d, a)
              }
            },
          })
        }
      },
    })
  })
  return createEngine
}

describe('a page whose annotations stop every engine they are read on', () => {
  afterEach(() => {
    setEngineFactory(undefined)
  })

  /** Each page's annotation ids, in page order. */
  const byPage = (doc: InkDocument): string[][] =>
    doc.pages.map((_, page) =>
      doc.annotations.list
        .get()
        .filter((a) => a.page === page)
        .map((a) => a.id)
    )

  it('opens without that page’s annotations; the other pages have theirs, and the document reads', async () => {
    const bytes = await fixtureBytes('saved-annotations')
    const plain = await openDocument(bytes.slice(), { assets: nodeAssets() })
    await plain.ready
    const expected = byPage(plain)
    plain.destroy()
    const bad = expected.findIndex((ids) => ids.length > 0)
    expect(expected.filter((ids) => ids.length > 0).length).toBeGreaterThan(1)

    setEngineFactory(
      trapsOn((method, args) => method === 'pageAnnotations' && args[0] === bad)
    )
    const doc = await openDocument(bytes.slice(), { assets: nodeAssets() })
    await doc.ready
    expect(doc.status.get()).toEqual({ state: 'ready' })
    expect(doc.engineStopped.get()).toBe(false)
    expect(byPage(doc)).toEqual(expected.map((ids, page) => (page === bad ? [] : ids)))
    // The other pages read; the page itself is blocked, as after any two stops of its own.
    await expect(doc.pageText(bad + 1)).resolves.toEqual(expect.any(String))
    await expect(doc.pageText(bad)).rejects.toMatchObject({
      code: 'EngineUnavailable',
      details: { page: bad },
    })
    doc.destroy()
  })

  it('opens a form whose widgets sit on that page and another; the other page’s fields work', async () => {
    // Page 0 holds most of the fields, page 1 a few, and `header.ref` has a widget on each.
    const bytes = await fixtureBytes('form-fields')
    setEngineFactory(
      trapsOn((method, args) => method === 'pageAnnotations' && args[0] === 1)
    )
    const doc = await openDocument(bytes.slice(), { assets: nodeAssets() })
    await doc.ready
    expect(doc.status.get()).toEqual({ state: 'ready' })
    expect(doc.engineStopped.get()).toBe(false)
    const fields = doc.form.fields.get()
    const names = fields.map((f) => f.name)
    expect(names).toEqual(expect.arrayContaining(['name', 'notes', 'header.ref']))
    // The blocked page lists no widgets, so fields only it holds have none to show.
    expect(names).not.toContain('rotated')
    expect(fields.flatMap((f) => f.widgets.map((w) => w.page))).not.toContain(1)
    expect(doc.form.set({ name: 'Ada' }).applied).toEqual(['name'])
    expect(doc.form.get('name')).toBe('Ada')
    doc.destroy()
  })
})

describe('a page whose structure order stops every engine it is read on', () => {
  afterEach(() => {
    setEngineFactory(undefined)
  })

  it('opens with the same fields', async () => {
    const bytes = await fixtureBytes('form-structure')
    const plain = await openDocument(bytes.slice(), { assets: nodeAssets() })
    await plain.ready
    const names = plain.form.fields.get().map((f) => f.name)
    plain.destroy()

    setEngineFactory(trapsOn((method) => method === 'structureOrder'))
    const doc = await openDocument(bytes.slice(), { assets: nodeAssets() })
    await doc.ready
    expect(doc.status.get()).toEqual({ state: 'ready' })
    expect(doc.engineStopped.get()).toBe(false)
    expect(doc.form.fields.get().map((f) => f.name)).toEqual(names)
    doc.destroy()
  })
})

describe('form fields', () => {
  it("reads a button's GoTo destinations as it did before", async () => {
    const doc = await openDocument(await fixtureBytes('form-goto'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const fields = doc.form.fields.get()
    doc.destroy()
    expect(fields.length).toBeGreaterThan(0)
    expect(fields).toMatchSnapshot()
  })
})

describe('lookups that fail', () => {
  it('a destination the file does not hold is an answer, asked once; a lookup that fails is asked again', async () => {
    const doc = await openDocument(await fixtureBytes('outline'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const spy = vi.spyOn(doc._reader, 'resolveDestination')
    for (let i = 0; i < 3; i++)
      await expect(doc.resolveDestination('nowhere')).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(1)
    // A reference that is not a page: asked once too.
    const catalog = [{ num: 1, gen: 0 }, { name: 'Fit' }]
    for (let i = 0; i < 3; i++)
      await expect(doc.resolveDestination(catalog)).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRejectedValue(new Error('no engine'))
    for (let i = 0; i < 2; i++)
      await expect(doc.resolveDestination('chapter-2')).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(4)
    doc.destroy()
  })

  it('an outline read that fails gives [] and is read again; one that succeeds is kept', async () => {
    const doc = await openDocument(await fixtureBytes('outline'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const spy = vi.spyOn(doc._reader, 'outline')
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
    const spy = vi.spyOn(doc._reader, 'outline')
    await expect(doc.outline()).resolves.toEqual([])
    await expect(doc.outline()).resolves.toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
    doc.destroy()
  })
})

describe('an engine that stops and cannot be started again', () => {
  afterEach(() => {
    setEngineFactory(undefined)
  })

  it('rejects the reads waiting and every later one with EngineUnavailable; the document stays ready, with its bytes and annotations', async () => {
    const bytes = await fixtureBytes('links')
    const { createEngine, trap } = trapsOnNextCall()
    setEngineFactory(createEngine)
    const doc = await openDocument(bytes.slice(), {
      assets: nodeAssets(),
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
    const { createEngine, trap } = trapsOnNextCall()
    setEngineFactory(createEngine)
    trap()
    const doc = await openDocument(await fixtureBytes('outline'), {
      assets: nodeAssets(),
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
    vi.stubGlobal('ImageData', FakeImageData)
    const held = heldEngines()
    setEngineFactory(() =>
      refuse() ? Promise.reject(new Error('no engine')) : held.factory()
    )
    const bytes = await fixtureBytes('text-simple')
    const doc = await openDocument(bytes.slice(), {
      assets: nodeAssets(),
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

  it('is not stopped while it reads, and a restart then does nothing', async () => {
    const { held, doc } = await openHeld()
    expect(doc.engineStopped.get()).toBe(false)
    const engines = held.engines.length
    await expect(doc.restartEngine()).resolves.toBeUndefined()
    expect(held.engines).toHaveLength(engines)
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
    // The next write runs on an engine of its own, which starts.
    mark(doc)
    await expect(doc.applyRedactions()).resolves.toMatchObject({ result: { marks: 1 } })
    expect(doc.engineStopped.get()).toBe(true)
    doc.destroy()
  })

  it("writes with the reader's engine while it reads, starting none", async () => {
    const { held, doc } = await openHeld()
    const engines = held.engines.length
    square(doc)
    await doc.save()
    mark(doc)
    await doc.applyRedactions()
    expect(held.engines).toHaveLength(engines)
    expect(held.engines.at(-1)).toMatchObject({ stopped: false, destroyed: false })
    doc.destroy()
  })

  describe('writes while it is stopped', () => {
    /** text-simple, stopped, with engines able to start again. */
    const openStopped = async () => {
      let refuse = false
      const opened = await openHeld(() => refuse)
      refuse = true
      await stopEngine(opened.held, opened.doc)
      refuse = false
      return {
        ...opened,
        refuse: (value: boolean) => {
          refuse = value
        },
      }
    }

    it('saves with an engine of its own, destroyed after, and stays stopped', async () => {
      const { held, doc } = await openStopped()
      const engines = held.engines.length
      square(doc)
      const bytes = await doc.save()
      expect(held.engines).toHaveLength(engines + 1)
      expect(held.engines.at(-1)).toEqual({
        opened: 1,
        closed: 1,
        stopped: false,
        destroyed: true,
      })
      expect(held.engines.every((e) => e.destroyed)).toBe(true)
      expect(doc.engineStopped.get()).toBe(true)
      await expect(doc.text(0)).rejects.toMatchObject(unavailable)
      const pdfjs = await openSecondReader(bytes)
      const annotations = (await pdfjs.annotations(0)) as { subtype: string }[]
      await pdfjs.destroy()
      expect(annotations.map((a) => a.subtype)).toEqual(['Square'])
      doc.destroy()
    })

    it('applies redactions and checks them on one engine of its own, destroyed after', async () => {
      const { held, doc } = await openStopped()
      const engines = held.engines.length
      mark(doc)
      const { bytes, result } = await doc.applyRedactions()
      expect(result.marks).toBe(1)
      expect(result.findings.candidates.map((c) => c.verdict)).toEqual(['clean'])
      expect(held.engines).toHaveLength(engines + 1)
      expect(held.engines.at(-1)).toMatchObject({ opened: 1, closed: 1, destroyed: true })
      expect(doc.engineStopped.get()).toBe(true)
      await expect(doc.text(0)).rejects.toMatchObject(unavailable)
      const pdfjs = await openSecondReader(bytes)
      expect(pdfjs.pageCount).toBe(3)
      await pdfjs.destroy()
      doc.destroy()
    })

    it('rejects with EngineUnavailable when the check stops that engine', async () => {
      const { held, doc } = await openStopped()
      mark(doc)
      held.stopOnNext('checkRedaction')
      await expect(doc.applyRedactions()).rejects.toMatchObject(unavailable)
      expect(held.engines.at(-1)).toMatchObject({ stopped: true, destroyed: true })
      doc.destroy()
    })

    it('rejects with EngineUnavailable when no engine starts for the write', async () => {
      const { held, doc, refuse } = await openStopped()
      const engines = held.engines.length
      refuse(true)
      square(doc)
      await expect(doc.save()).rejects.toMatchObject(unavailable)
      mark(doc)
      await expect(doc.applyRedactions()).rejects.toMatchObject(unavailable)
      expect(held.engines).toHaveLength(engines)
      expect(held.engines.every((e) => e.destroyed)).toBe(true)
      doc.destroy()
    })

    it('rejects with EngineUnavailable when that engine stops, and starts another at the next save', async () => {
      const { held, doc } = await openStopped()
      const engines = held.engines.length
      square(doc)
      held.stopOnNext('write')
      await expect(doc.save()).rejects.toMatchObject(unavailable)
      expect(held.engines).toHaveLength(engines + 1)
      expect(held.engines.at(-1)).toMatchObject({ stopped: true, destroyed: true })
      await expect(doc.save()).resolves.toBeInstanceOf(Uint8Array)
      expect(held.engines).toHaveLength(engines + 2)
      expect(held.engines.at(-1)).toMatchObject({ stopped: false, destroyed: true })
      expect(doc.engineStopped.get()).toBe(true)
      doc.destroy()
    })

    it('rejects a write the file cannot take with SaveFailed, as a document that reads does', async () => {
      const { doc } = await openStopped()
      const box = doc.annotations.add({
        type: 'freetext',
        page: 0,
        rect: { x: 100, y: 100, width: 200, height: 40 },
        contents: '你好，世界',
      })
      await expect(doc.save()).rejects.toMatchObject({
        code: 'SaveFailed',
        details: { stage: 'write', annotation: box.id },
      })
      doc.destroy()
    })

    type Call = (...args: unknown[]) => unknown

    /**
     * text-simple, read by real engines that `held` counts, with hooks into each engine started.
     * While `hooks.refuse` is true no engine starts. `holdStart()` holds the next engine's start
     * until the function it returns is called. `gate(method)` holds the next `write` or `redact`
     * until the function it returns is called; `reached(method)` says whether one waits there.
     * An engine started while `hooks.failWrites` is true fails every write as a file it cannot
     * write into. `destroys[i]` counts the destroys of the engine `held.engines[i]`.
     */
    const openHooked = async () => {
      vi.stubGlobal('ImageData', FakeImageData)
      const held = heldEngines()
      const destroys: number[] = []
      const gates = new Map<string, { at: Promise<void>; reached: boolean }>()
      const hooks = {
        refuse: false,
        failWrites: false,
        starting: false,
        startHeld: undefined as Promise<void> | undefined,
      }
      setEngineFactory(async () => {
        const wait = hooks.startHeld
        hooks.startHeld = undefined
        hooks.starting = true
        if (wait) await wait
        if (hooks.refuse) throw new Error('no engine')
        const failWrites = hooks.failWrites
        const engine = await held.factory()
        const index = held.engines.length - 1
        destroys[index] = 0
        return new Proxy(engine, {
          get(target, key, receiver) {
            const value = Reflect.get(target, key, receiver) as unknown
            if (key === 'destroy')
              return () => {
                destroys[index]!++
                return (value as Call)()
              }
            if (key !== 'open') return value
            return async (...args: unknown[]) => {
              const opened = (await (value as Call)(...args)) as object
              return new Proxy(opened, {
                get(d, name, r) {
                  const member = Reflect.get(d, name, r) as unknown
                  if (name !== 'write' && name !== 'redact') return member
                  return async (...a: unknown[]) => {
                    const gate = gates.get(name)
                    if (gate) {
                      gates.delete(name)
                      gate.reached = true
                      await gate.at
                    }
                    if (failWrites && name === 'write')
                      throw new EngineError('write-failed', 'The file cannot take it')
                    return (member as Call)(...a)
                  }
                },
              })
            }
          },
        })
      })
      const doc = await openDocument((await fixtureBytes('text-simple')).slice(), {
        assets: nodeAssets(),
      })
      await doc.ready
      const holdStart = () => {
        let release!: () => void
        hooks.starting = false
        hooks.startHeld = new Promise<void>((resolve) => (release = resolve))
        return release
      }
      const gate = (name: 'write' | 'redact') => {
        let release!: () => void
        const at = new Promise<void>((resolve) => (release = resolve))
        gates.set(name, { at, reached: false })
        const entry = gates.get(name)!
        return { release, reached: () => entry.reached }
      }
      /** Stops the reader under a draw, no engine able to start, then lets engines start. */
      const stop = async () => {
        hooks.refuse = true
        await stopEngine(held, doc)
        hooks.refuse = false
      }
      return { held, doc, hooks, destroys, holdStart, gate, stop }
    }

    it('rejects with DocumentDestroyed when destroyed before the write opens the file, and destroys the engine', async () => {
      const { held, doc } = await openStopped()
      const engines = held.engines.length
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      // The write's engine waits to open the file until the document is destroyed.
      setEngineFactory(async () => {
        const engine = await held.factory()
        return new Proxy(engine, {
          get(target, key, receiver) {
            const value = Reflect.get(target, key, receiver) as unknown
            if (key !== 'open') return value
            return async (...args: unknown[]) => {
              await gate
              return (value as (...a: unknown[]) => unknown)(...args)
            }
          },
        })
      })
      square(doc)
      const saving = doc.save()
      await vi.waitFor(() => expect(held.engines).toHaveLength(engines + 1))
      doc.destroy()
      release()
      await expect(saving).rejects.toMatchObject({ code: 'DocumentDestroyed' })
      await vi.waitFor(() => expect(held.engines.at(-1)!.destroyed).toBe(true))
    })

    it('rejects with DocumentDestroyed when destroyed during the write, and destroys the engine once', async () => {
      const { held, doc, destroys, gate, stop } = await openHooked()
      await stop()
      const engines = held.engines.length
      const writing = gate('write')
      square(doc)
      const saving = doc.save()
      await vi.waitFor(() => expect(writing.reached()).toBe(true))
      doc.destroy()
      writing.release()
      await expect(saving).rejects.toMatchObject({ code: 'DocumentDestroyed' })
      expect(held.engines).toHaveLength(engines + 1)
      expect(held.engines.at(-1)!.destroyed).toBe(true)
      expect(destroys.at(-1)).toBe(1)
    })

    it('rejects with DocumentDestroyed when destroyed while the engine starts, and destroys the engine once', async () => {
      const { held, doc, hooks, destroys, holdStart, stop } = await openHooked()
      await stop()
      const engines = held.engines.length
      const start = holdStart()
      square(doc)
      const saving = doc.save()
      await vi.waitFor(() => expect(hooks.starting).toBe(true))
      doc.destroy()
      start()
      await expect(saving).rejects.toMatchObject({ code: 'DocumentDestroyed' })
      await vi.waitFor(() => expect(held.engines).toHaveLength(engines + 1))
      await vi.waitFor(() => expect(held.engines.at(-1)!.destroyed).toBe(true))
      expect(held.engines.at(-1)!.opened).toBe(0)
      expect(destroys.at(-1)).toBe(1)
    })

    it('fails as the engine it ran on says: called while reading, run once stopped, the file refuses it', async () => {
      const { doc, hooks, gate, stop } = await openHooked()
      // An apply holds the reader's engine while a save waits its turn behind it.
      mark(doc)
      const applying = gate('redact')
      const applied = doc.applyRedactions()
      await vi.waitFor(() => expect(applying.reached()).toBe(true))
      square(doc)
      const saving = doc.save()
      await stop()
      hooks.failWrites = true
      applying.release()
      await expect(applied).rejects.toMatchObject(unavailable)
      await expect(saving).rejects.toMatchObject({
        code: 'SaveFailed',
        details: { stage: 'write' },
      })
      expect(doc.engineStopped.get()).toBe(true)
      doc.destroy()
    })

    it('fails as the engine it ran on says: called while stopped, run once restarted, its stop stops the reader', async () => {
      const { held, doc, hooks, holdStart, stop } = await openHooked()
      await stop()
      // An apply holds the turn on an engine of its own, still starting, while a save waits.
      mark(doc)
      const start = holdStart()
      const applied = doc.applyRedactions()
      await vi.waitFor(() => expect(hooks.starting).toBe(true))
      square(doc)
      const saving = doc.save()
      await doc.restartEngine()
      expect(doc.engineStopped.get()).toBe(false)
      // Two stops by reads; the save's write is the third within 60 seconds.
      for (const page of [1, 2]) {
        held.stopOnNext('pageText')
        await doc.text(page)
      }
      expect(doc.engineStopped.get()).toBe(false)
      held.stopOnNext('write')
      start()
      await expect(applied).resolves.toMatchObject({ result: { marks: 1 } })
      await expect(saving).rejects.toMatchObject(unavailable)
      expect(doc.engineStopped.get()).toBe(true)
      doc.destroy()
    })

    it('gives callers of one write the same failure, whichever side of the stop they called from', async () => {
      const { doc, hooks, gate, stop } = await openHooked()
      mark(doc)
      const applying = gate('redact')
      const applied = doc.applyRedactions()
      await vi.waitFor(() => expect(applying.reached()).toBe(true))
      square(doc)
      const reading = doc.save()
      await stop()
      const stopped = doc.save()
      hooks.failWrites = true
      applying.release()
      await applied.catch(() => undefined)
      const codes = await Promise.all(
        [reading, stopped].map((s) => s.catch((e: { code: string }) => e.code))
      )
      expect(codes).toEqual(['SaveFailed', 'SaveFailed'])
      doc.destroy()
    })

    it('starts no engine for a second save of the same changes', async () => {
      const { held, doc } = await openStopped()
      const engines = held.engines.length
      square(doc)
      const first = await doc.save()
      await expect(doc.save()).resolves.toEqual(first)
      expect(held.engines).toHaveLength(engines + 1)
      doc.destroy()
    })
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
    })
    await next.ready
    await expect(next.text(0)).resolves.toMatchObject({ page: 0 })
    expect(next.engineStopped.get()).toBe(false)
    doc.destroy()
    next.destroy()
  })
})
