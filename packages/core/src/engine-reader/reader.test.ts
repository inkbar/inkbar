import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { mapInOrder } from '../model/map-in-order'

import { createEngineReader, MAX_PIXELS } from './reader'
import { explicitDest } from './test-utils'

import type { ReaderEngine, ReaderEngineDocument } from './types'
import type { EngineLoader } from '../model/save/saver'
import type { DrawRequest } from '../reader/types'
import type * as EngineModule from '@inkbar/engine'

type RenderOptions = Parameters<ReaderEngineDocument['renderPage']>[1]
type Rendered = Awaited<ReturnType<ReaderEngineDocument['renderPage']>>
type PageTextResult = Awaited<ReturnType<ReaderEngineDocument['pageText']>>
type PageLinksResult = Awaited<ReturnType<ReaderEngineDocument['pageLinks']>>
type OutlineResult = Awaited<ReturnType<ReaderEngineDocument['outline']>>
type NamedResult = Awaited<ReturnType<ReaderEngineDocument['namedDestination']>>

/** The engine's characters for one Courier word, `Hi`, on the baseline at (72, 700). */
function hiText(): PageTextResult {
  const geometry = new Float32Array(30)
  geometry.set([72, 697, 78, 709, 72, 697, 78, 709, 72, 700, 12, 1, 0, 0, 1], 0)
  geometry.set([78, 697, 84, 709, 78, 697, 84, 709, 78, 700, 12, 1, 0, 0, 1], 15)
  return {
    count: 2,
    codes: new Uint32Array([0x48, 0x69]),
    geometry,
    flags: new Uint8Array(2),
    fonts: new Uint16Array(2),
    fontTable: [
      {
        name: 'Courier',
        fixedPitch: true,
        serif: true,
        vertical: false,
      },
    ],
  }
}

/** An `EngineError` as the engine throws it, told by its name and code. */
function engineError(code: string): Error {
  const error = new Error(code) as Error & { code: string }
  error.name = 'EngineError'
  error.code = code
  return error
}

/** A rejection with a plain object that carries only a code. */
const rejectWithCode = (code: string): Promise<never> =>
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- told by its code alone
  Promise.reject({ code })

/** A bitmap of the size asked, with a token array: nothing here allocates the pixels. */
const bitmap = (options: RenderOptions, missingFonts: string[] = []): Rendered => ({
  width: options.size!.width,
  height: options.size!.height,
  data: new Uint8ClampedArray(4),
  missingFonts,
})

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** A render that waits for `gate`, and rejects with `aborted` as the engine does on abort. */
function abortable(options: RenderOptions, gate: Promise<void>): Promise<Rendered> {
  return new Promise<Rendered>((resolve, reject) => {
    const signal = options.signal
    if (signal?.aborted) return reject(engineError('aborted'))
    signal?.addEventListener('abort', () => reject(engineError('aborted')), {
      once: true,
    })
    void gate.then(() => resolve(bitmap(options)))
  })
}

/** What a fake engine knows of itself, handed to the render function. */
interface EngineState {
  /** Which engine this is, counting from 0. */
  index: number
  /** Aborted when the engine is destroyed. */
  ending: AbortSignal
  /** Set once a call stops the engine; every later call then rejects with `engine-failure`. */
  stopped: boolean
}

type RenderFn = (
  call: number,
  index: number,
  options: RenderOptions,
  engine: EngineState
) => Promise<Rendered>

/** Whether a rejection carries `code`, as an `EngineError` or a plain object does. */
const hasCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === code

interface FakeEngine extends ReaderEngine {
  open: ReturnType<typeof vi.fn<ReaderEngine['open']>>
  destroy: ReturnType<typeof vi.fn<ReaderEngine['destroy']>>
  doc: Omit<
    ReaderEngineDocument,
    'close' | 'pageInfo' | 'pageText' | 'pageLinks' | 'outline' | 'namedDestination'
  > & {
    close: ReturnType<typeof vi.fn<ReaderEngineDocument['close']>>
    pageInfo: ReturnType<typeof vi.fn<ReaderEngineDocument['pageInfo']>>
    pageText: ReturnType<typeof vi.fn<ReaderEngineDocument['pageText']>>
    pageLinks: ReturnType<typeof vi.fn<ReaderEngineDocument['pageLinks']>>
    outline: ReturnType<typeof vi.fn<ReaderEngineDocument['outline']>>
    namedDestination: ReturnType<typeof vi.fn<ReaderEngineDocument['namedDestination']>>
  }
}

/**
 * A fake engine module: every `createEngine` makes a new engine over a one-page document. By
 * default an `engine-failure` from a render stops that engine, as a trap does: every later call
 * on it rejects with `engine-failure`. With `traps: false` the engine goes on, as it does for a
 * page that cannot be loaded or drawn.
 */
function setup(
  opts: {
    render?: RenderFn
    rotation?: 0 | 90 | 180 | 270
    pageCount?: number
    traps?: boolean
    /** What `pageText` answers; by default the word `Hi`. A rejection stops the engine as a render's does. */
    pageText?: (index: number, engine: EngineState) => Promise<PageTextResult>
    /** What `pageLinks` answers; by default no annotations. A rejection stops the engine. */
    pageLinks?: (index: number, engine: EngineState) => Promise<PageLinksResult>
    /** What `outline` answers; by default no items. */
    outline?: (engine: EngineState) => Promise<OutlineResult>
    /** What `namedDestination` answers; by default nothing. */
    namedDestination?: (name: Uint8Array, engine: EngineState) => Promise<NamedResult>
  } = {}
) {
  const engines: FakeEngine[] = []
  const states: EngineState[] = []
  const renders: { index: number; options: RenderOptions; engine: number }[] = []
  const render: RenderFn =
    opts.render ?? ((_, __, options) => Promise.resolve(bitmap(options)))
  const createEngine = vi.fn((): Promise<FakeEngine> => {
    const ending = new AbortController()
    const state: EngineState = {
      index: states.length,
      ending: ending.signal,
      stopped: false,
    }
    states.push(state)
    const live = (): Promise<void> =>
      state.stopped || ending.signal.aborted
        ? Promise.reject(engineError('engine-failure'))
        : Promise.resolve()
    const doc = {
      pageCount: opts.pageCount ?? 1,
      pageInfo: vi.fn<ReaderEngineDocument['pageInfo']>(() =>
        live().then(() => ({
          width: 612,
          height: 792,
          rotation: opts.rotation ?? 0,
          box: { x: 0, y: 0, width: 612, height: 792 },
          userUnit: 1,
        }))
      ),
      renderPage: vi.fn((index: number, options: RenderOptions) => {
        if (state.stopped || ending.signal.aborted)
          return Promise.reject(engineError('engine-failure'))
        renders.push({ index, options, engine: state.index })
        return render(renders.length, index, options, state).catch((error: unknown) => {
          if ((opts.traps ?? true) && hasCode(error, 'engine-failure'))
            state.stopped = true
          throw error
        })
      }),
      // A read whose signal aborts before it is answered rejects with `aborted`, as the engine's does.
      pageText: vi.fn<ReaderEngineDocument['pageText']>((index, options) => {
        const reading = live()
          .then(() => (opts.pageText ? opts.pageText(index, state) : hiText()))
          .catch((error: unknown) => {
            if ((opts.traps ?? true) && hasCode(error, 'engine-failure'))
              state.stopped = true
            throw error
          })
        const signal = options?.signal
        if (!signal) return reading
        if (signal.aborted) return Promise.reject(engineError('aborted'))
        return new Promise<PageTextResult>((resolve, reject) => {
          signal.addEventListener('abort', () => reject(engineError('aborted')), {
            once: true,
          })
          reading.then(resolve, reject)
        })
      }),
      pageLinks: vi.fn<ReaderEngineDocument['pageLinks']>((index) =>
        live()
          .then(() =>
            opts.pageLinks ? opts.pageLinks(index, state) : { annotations: [], links: [] }
          )
          .catch((error: unknown) => {
            if ((opts.traps ?? true) && hasCode(error, 'engine-failure'))
              state.stopped = true
            throw error
          })
      ),
      outline: vi.fn<ReaderEngineDocument['outline']>(() =>
        live().then(() =>
          opts.outline ? opts.outline(state) : { items: [], truncated: false }
        )
      ),
      namedDestination: vi.fn<ReaderEngineDocument['namedDestination']>((name) =>
        live()
          .then(() =>
            opts.namedDestination ? opts.namedDestination(name, state) : undefined
          )
          .catch((error: unknown) => {
            if ((opts.traps ?? true) && hasCode(error, 'engine-failure'))
              state.stopped = true
            throw error
          })
      ),
      close: vi.fn(() => Promise.resolve()),
    }
    const engine: FakeEngine = {
      open: vi.fn(() => Promise.resolve(doc)),
      destroy: vi.fn(() => {
        ending.abort()
        return Promise.resolve()
      }),
      doc,
    }
    engines.push(engine)
    return Promise.resolve(engine)
  })
  const loader = vi.fn(() => Promise.resolve({ createEngine }))
  const warn = vi.fn<(message: string) => void>()
  const open = () =>
    createEngineReader({
      loader: loader as unknown as EngineLoader,
      bytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      password: undefined,
      warn,
    })
  return { engines, states, renders, createEngine, loader, warn, open }
}

/**
 * Calls answered one at a time on each engine, in the order asked, as the engine's one queue
 * answers them. A call for which `traps` is true stops the engine: it and every call still
 * queued or asked later on that engine reject with `engine-failure`.
 */
function oneQueue<A, T>(traps: (arg: A) => boolean, answer: (arg: A) => Promise<T>) {
  const tails = new Map<number, Promise<unknown>>()
  return (arg: A, engine: EngineState): Promise<T> => {
    const turn = (tails.get(engine.index) ?? Promise.resolve()).then(async () => {
      // Once the engine has stopped, every call queued on it fails at once.
      if (engine.stopped) throw engineError('engine-failure')
      // A call takes a while, so the calls asked meanwhile queue behind it.
      await new Promise((resolve) => setTimeout(resolve))
      if (engine.stopped) throw engineError('engine-failure')
      if (traps(arg)) {
        engine.stopped = true
        throw engineError('engine-failure')
      }
      return answer(arg)
    })
    tails.set(
      engine.index,
      turn.catch(() => undefined)
    )
    return turn
  }
}

/** A canvas with a stubbed 2D context: its bitmap is never allocated. */
function fakeCanvas() {
  const scratchContext = { putImageData: vi.fn(), drawImage: vi.fn() }
  const scratch = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => scratchContext),
  }
  const context = { putImageData: vi.fn(), drawImage: vi.fn() }
  const canvas = {
    width: 300,
    height: 150,
    getContext: vi.fn(() => context),
    ownerDocument: { createElement: vi.fn(() => scratch) },
  }
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    raw: canvas,
    context,
    scratch,
    scratchContext,
  }
}

const request = (over: Partial<DrawRequest> = {}): DrawRequest => ({
  page: 0,
  rotation: 0,
  zoom: 1,
  pixelRatio: 1,
  width: 612,
  height: 792,
  hide: [],
  ...over,
})

class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number
  ) {}
}

beforeEach(() => {
  vi.stubGlobal('ImageData', FakeImageData)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

// The reader declares the engine by shape; this holds the shape to the engine's own types.
describe('the engine shapes', () => {
  it('asks of the engine only what the engine has', () => {
    expectTypeOf<EngineModule.Engine>().toExtend<ReaderEngine>()
    expectTypeOf<EngineModule.EngineDocument>().toExtend<ReaderEngineDocument>()
  })
})

describe('opening', () => {
  it('opens the bytes in an engine of its own and reports the page count', async () => {
    const t = setup({ pageCount: 3 })
    const reader = await t.open()
    expect(reader.kind).toBe('engine')
    expect(reader.pageCount).toBe(3)
    expect(t.createEngine).toHaveBeenCalledTimes(1)
    expect(t.engines[0]!.open).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), {})
  })

  it('passes the password', async () => {
    const t = setup()
    await createEngineReader({
      loader: t.loader as unknown as EngineLoader,
      bytes: () => Promise.resolve(new Uint8Array([1])),
      password: 'secret',
    })
    expect(t.engines[0]!.open).toHaveBeenCalledWith(new Uint8Array([1]), {
      password: 'secret',
    })
  })

  it('passes an empty password, as the PDF.js reader does', async () => {
    const t = setup()
    await createEngineReader({
      loader: t.loader as unknown as EngineLoader,
      bytes: () => Promise.resolve(new Uint8Array([1])),
      password: '',
    })
    expect(t.engines[0]!.open).toHaveBeenCalledWith(new Uint8Array([1]), { password: '' })
  })

  it('rejects with SaveFailed at the engine stage when the loader fails', async () => {
    const reader = createEngineReader({
      loader: () => Promise.reject(new Error('offline')),
      bytes: () => Promise.resolve(new Uint8Array()),
      password: undefined,
    })
    await expect(reader).rejects.toMatchObject({
      code: 'SaveFailed',
      details: { stage: 'engine' },
    })
  })

  it('rejects with SaveFailed at the engine stage when createEngine fails', async () => {
    const reader = createEngineReader({
      loader: () =>
        Promise.resolve({ createEngine: () => Promise.reject(new Error('no wasm')) }),
      bytes: () => Promise.resolve(new Uint8Array()),
      password: undefined,
    })
    await expect(reader).rejects.toMatchObject({
      code: 'SaveFailed',
      details: { stage: 'engine' },
    })
  })

  it('rejects with SaveFailed at the write stage when the engine refuses the file, and destroys it', async () => {
    const t = setup()
    t.createEngine.mockImplementationOnce(() => {
      const engine = {
        open: vi.fn(() => Promise.reject(engineError('invalid-pdf'))),
        destroy: vi.fn(() => Promise.resolve()),
      }
      t.engines.push(engine as unknown as FakeEngine)
      return Promise.resolve(engine as unknown as FakeEngine)
    })
    await expect(t.open()).rejects.toMatchObject({
      code: 'SaveFailed',
      details: { stage: 'write' },
    })
    expect(t.engines[0]!.destroy).toHaveBeenCalledTimes(1)
  })

  it('rejects with EngineUnavailable when the document cannot render, and frees it once', async () => {
    const t = setup()
    const close = vi.fn(() => Promise.resolve())
    const destroy = vi.fn(() => Promise.resolve())
    t.createEngine.mockImplementationOnce(() =>
      Promise.resolve({
        open: () => Promise.resolve({ pageCount: 1, close, write: () => undefined }),
        destroy,
      } as unknown as FakeEngine)
    )
    await expect(t.open()).rejects.toMatchObject({ code: 'EngineUnavailable' })
    expect(close).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})

describe('page facts', () => {
  it("maps the engine's page info to core's", async () => {
    const t = setup({ rotation: 90 })
    const reader = await t.open()
    await expect(reader.pageInfo(0)).resolves.toEqual({
      index: 0,
      box: { x: 0, y: 0, width: 612, height: 792 },
      rotate: 90,
      userUnit: 1,
      width: 612,
      height: 792,
    })
  })

  it('rejects with PageOutOfRange for a page the file does not have', async () => {
    const t = setup()
    const reader = await t.open()
    await expect(reader.pageInfo(1)).rejects.toMatchObject({ code: 'PageOutOfRange' })
    await expect(reader.pageInfo(-1)).rejects.toMatchObject({ code: 'PageOutOfRange' })
  })
})

describe('drawing', () => {
  it("turns by the request's rotation less the page's own", async () => {
    const t = setup({ rotation: 90 })
    const reader = await t.open()
    const { canvas } = fakeCanvas()
    await reader.draw(request({ rotation: 270, width: 792, height: 612 }), canvas)
    expect(t.renders[0]!.options.rotation).toBe(180)
  })

  it('asks for the exact size and region, and puts the pixels on the canvas at that size', async () => {
    const t = setup()
    const reader = await t.open()
    const { canvas, raw, context } = fakeCanvas()
    const region = { x: 72, y: 700, width: 50, height: 50 }
    await reader.draw(request({ width: 200, height: 201, region }), canvas)
    expect(t.renders[0]).toMatchObject({
      index: 0,
      options: { size: { width: 200, height: 201 }, region, rotation: 0 },
    })
    expect(raw.width).toBe(200)
    expect(raw.height).toBe(201)
    expect(context.putImageData).toHaveBeenCalledTimes(1)
    const [image, x, y] = context.putImageData.mock.calls[0]! as [
      FakeImageData,
      number,
      number,
    ]
    expect([image.width, image.height, x, y]).toEqual([200, 201, 0, 0])
    expect(context.drawImage).not.toHaveBeenCalled()
  })

  it('hides the annotations it has object numbers for', async () => {
    const t = setup()
    const reader = await t.open()
    await reader.draw(
      request({ hide: [{ id: '12R', objectNumber: 12 }, { id: 'annot_4' }] }),
      fakeCanvas().canvas
    )
    expect(t.renders[0]!.options.hide).toEqual([12])
  })

  it('draws an oversized request smaller and stretches it onto the canvas', async () => {
    const t = setup()
    const reader = await t.open()
    const { canvas, raw, context, scratch, scratchContext } = fakeCanvas()
    await reader.draw(request({ width: 16_588, height: 23_458 }), canvas)
    const size = t.renders[0]!.options.size!
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_PIXELS)
    expect(Math.abs(size.width / size.height / (16_588 / 23_458) - 1)).toBeLessThan(0.001)
    expect(raw.width).toBe(16_588)
    expect(raw.height).toBe(23_458)
    expect(scratchContext.putImageData).toHaveBeenCalledTimes(1)
    expect(context.putImageData).not.toHaveBeenCalled()
    expect(context.drawImage).toHaveBeenCalledWith(scratch, 0, 0, 16_588, 23_458)
    // The scratch bitmap is let go once drawn.
    expect([scratch.width, scratch.height]).toEqual([0, 0])
  })

  it('reads a page whose text the engine cut short, and warns once for it', async () => {
    const t = setup({ pageText: () => Promise.resolve({ ...hiText(), truncated: true }) })
    const reader = await t.open()
    const { items } = await reader.text(0, { glyphs: false })
    expect(items.map((i) => i.str)).toEqual(['Hi'])
    await reader.text(0, { glyphs: true })
    expect(t.warn).toHaveBeenCalledTimes(1)
    expect(t.warn).toHaveBeenCalledWith(
      'Inkbar: page 1 has more text than can be read; its text is read up to the first 1,000,000 characters.'
    )
  })

  it('warns once per missing font key', async () => {
    const t = setup({
      render: (_, __, options) => Promise.resolve(bitmap(options, ['japanese'])),
    })
    const reader = await t.open()
    await reader.draw(request(), fakeCanvas().canvas)
    await reader.draw(request(), fakeCanvas().canvas)
    expect(t.warn).toHaveBeenCalledTimes(1)
    expect(t.warn).toHaveBeenCalledWith(
      'Inkbar: no fallback font for "japanese" text; some text on this page is drawn with a substitute.'
    )
  })
})

describe('an engine that stops', () => {
  it('is replaced and the draw retried once', async () => {
    const t = setup({
      render: (call, _, options) =>
        call === 1
          ? Promise.reject(engineError('engine-failure'))
          : Promise.resolve(bitmap(options)),
    })
    const reader = await t.open()
    const { canvas, context } = fakeCanvas()
    await reader.draw(request(), canvas)
    expect(t.createEngine).toHaveBeenCalledTimes(2)
    expect(context.putImageData).toHaveBeenCalledTimes(1)
    // The dead engine is freed once; the new one opened the file again.
    expect(t.engines[0]!.doc.close).toHaveBeenCalledTimes(1)
    expect(t.engines[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(t.engines[1]!.open).toHaveBeenCalledTimes(1)
    expect(t.engines[1]!.destroy).not.toHaveBeenCalled()
  })

  it('a plain { code } rejection counts as well', async () => {
    const t = setup({
      render: (call, _, options) =>
        call === 1 ? rejectWithCode('engine-failure') : Promise.resolve(bitmap(options)),
    })
    const reader = await t.open()
    await reader.draw(request(), fakeCanvas().canvas)
    expect(t.createEngine).toHaveBeenCalledTimes(2)
  })

  it('a second failure rejects, without a third engine', async () => {
    const t = setup({ render: () => Promise.reject(engineError('engine-failure')) })
    const reader = await t.open()
    await expect(reader.draw(request(), fakeCanvas().canvas)).rejects.toMatchObject({
      code: 'engine-failure',
    })
    expect(t.createEngine).toHaveBeenCalledTimes(2)
  })

  it('draws waiting on the dead engine retry on one new engine, once each', async () => {
    const gate = deferred<void>()
    const t = setup({
      render: (call, _, options) =>
        call <= 3
          ? gate.promise.then(() => Promise.reject(engineError('engine-failure')))
          : Promise.resolve(bitmap(options)),
    })
    const reader = await t.open()
    const draws = [0, 1, 2].map(() => reader.draw(request(), fakeCanvas().canvas))
    await vi.waitFor(() => expect(t.renders).toHaveLength(3))
    gate.resolve()
    await Promise.all(draws)
    expect(t.createEngine).toHaveBeenCalledTimes(2)
    expect(t.renders).toHaveLength(6)
  })

  it('a draw issued while the replacement starts waits for it and starts no other', async () => {
    const t = setup({
      render: (call, _, options) =>
        call === 1
          ? Promise.reject(engineError('engine-failure'))
          : Promise.resolve(bitmap(options)),
    })
    const reader = await t.open()
    const starting = deferred<void>()
    const make = t.createEngine.getMockImplementation()!
    t.createEngine.mockImplementationOnce(async () => {
      await starting.promise
      return make()
    })
    const first = fakeCanvas()
    const firstDraw = reader.draw(request(), first.canvas)
    await vi.waitFor(() => expect(t.createEngine).toHaveBeenCalledTimes(2))
    const second = fakeCanvas()
    const secondDraw = reader.draw(request({ page: 0, zoom: 2 }), second.canvas)
    starting.resolve()
    await Promise.all([firstDraw, secondDraw])
    expect(t.createEngine).toHaveBeenCalledTimes(2)
    expect(t.engines[1]!.open).toHaveBeenCalledTimes(1)
    // One failed render on the first engine, then both draws on the replacement.
    expect(t.renders).toHaveLength(3)
    expect(first.context.putImageData).toHaveBeenCalledTimes(1)
    expect(second.context.putImageData).toHaveBeenCalledTimes(1)
  })

  it('a page that cannot be drawn on a working engine fails alone, without a restart', async () => {
    const cannot = engineError('engine-failure')
    const t = setup({
      pageCount: 2,
      traps: false,
      render: (_, index, options) =>
        index === 1 ? Promise.reject(cannot) : Promise.resolve(bitmap(options)),
    })
    const reader = await t.open()
    const broken = fakeCanvas()
    const healthy = fakeCanvas()
    const [bad, good] = await Promise.allSettled([
      reader.draw(request({ page: 1 }), broken.canvas),
      reader.draw(request({ page: 0 }), healthy.canvas),
    ])
    expect(bad).toEqual({ status: 'rejected', reason: cannot })
    expect(good).toEqual({ status: 'fulfilled', value: undefined })
    expect(healthy.context.putImageData).toHaveBeenCalledTimes(1)
    expect(broken.context.putImageData).not.toHaveBeenCalled()
    expect(t.createEngine).toHaveBeenCalledTimes(1)
    expect(t.engines[0]!.destroy).not.toHaveBeenCalled()
    // Asked again, it fails again on the same engine: still no restart.
    await expect(reader.draw(request({ page: 1 }), fakeCanvas().canvas)).rejects.toBe(
      cannot
    )
    await reader.draw(request({ page: 0 }), fakeCanvas().canvas)
    expect(t.createEngine).toHaveBeenCalledTimes(1)
  })

  it('a real stop restarts once, retries a sibling the restart aborted, and retries the failing draw once', async () => {
    const gate = deferred<void>()
    const t = setup({
      pageCount: 2,
      render: (_, index, options, engine) => {
        if (index === 1)
          return engine.index === 0
            ? gate.promise.then(() => Promise.reject(engineError('engine-failure')))
            : Promise.reject(engineError('engine-failure'))
        if (engine.index > 0) return Promise.resolve(bitmap(options))
        // The sibling on the first engine runs until the engine is destroyed under it.
        return new Promise<Rendered>((_resolve, reject) => {
          engine.ending.addEventListener('abort', () => reject(engineError('aborted')), {
            once: true,
          })
        })
      },
    })
    const reader = await t.open()
    const failing = fakeCanvas()
    const sibling = fakeCanvas()
    const failingDraw = reader.draw(request({ page: 1 }), failing.canvas)
    const siblingDraw = reader.draw(request({ page: 0 }), sibling.canvas)
    await vi.waitFor(() => expect(t.renders).toHaveLength(2))
    gate.resolve()
    const [bad, good] = await Promise.allSettled([failingDraw, siblingDraw])
    expect(bad).toMatchObject({ status: 'rejected', reason: { code: 'engine-failure' } })
    expect(good).toEqual({ status: 'fulfilled', value: undefined })
    expect(sibling.context.putImageData).toHaveBeenCalledTimes(1)
    expect(failing.context.putImageData).not.toHaveBeenCalled()
    expect(t.createEngine).toHaveBeenCalledTimes(2)
    expect(t.engines[0]!.destroy).toHaveBeenCalledTimes(1)
    // Each draw ran once on each engine.
    expect(t.renders.map((r) => [r.engine, r.index]).sort()).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ])
  })

  it('a page-facts call aborted by a restart is retried on the new engine', async () => {
    const t = setup({
      pageCount: 2,
      render: (call, _, options) =>
        call === 1
          ? Promise.reject(engineError('engine-failure'))
          : Promise.resolve(bitmap(options)),
    })
    const reader = await t.open()
    const first = t.engines[0]!
    const facts = deferred<void>()
    const original = first.doc.pageInfo.getMockImplementation()!
    // Page 1's facts are held until the engine is destroyed, then rejected as the engine does.
    first.doc.pageInfo.mockImplementation((index: number) =>
      index === 1
        ? facts.promise.then(() => Promise.reject(engineError('aborted')))
        : original(index)
    )
    first.destroy.mockImplementation(() => {
      facts.resolve()
      return Promise.resolve()
    })
    const asked = reader.pageInfo(1)
    await reader.draw(request({ page: 0 }), fakeCanvas().canvas)
    await expect(asked).resolves.toMatchObject({ index: 1 })
    expect(t.createEngine).toHaveBeenCalledTimes(2)
    expect(t.engines[1]!.doc.pageInfo).toHaveBeenCalledWith(1)
  })

  it('an aborted draw is never taken for a stopped engine', async () => {
    const t = setup({
      render: (_, __, options) => abortable(options, new Promise(() => {})),
    })
    const reader = await t.open()
    const controller = new AbortController()
    const drawing = reader.draw(request(), fakeCanvas().canvas, controller.signal)
    await vi.waitFor(() => expect(t.renders).toHaveLength(1))
    controller.abort()
    await expect(drawing).rejects.toBe(controller.signal.reason)
    expect(t.createEngine).toHaveBeenCalledTimes(1)
  })
})

describe('destroy', () => {
  it('rejects a running draw with DocumentDestroyed and frees the engine once', async () => {
    const t = setup({
      render: (_, __, options) => abortable(options, new Promise(() => {})),
    })
    const reader = await t.open()
    const { canvas, context } = fakeCanvas()
    const drawing = reader.draw(request(), canvas)
    await vi.waitFor(() => expect(t.renders).toHaveLength(1))
    await Promise.all([reader.destroy(), reader.destroy()])
    await expect(drawing).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    expect(t.renders[0]!.options.signal!.aborted).toBe(true)
    expect(t.engines[0]!.doc.close).toHaveBeenCalledTimes(1)
    expect(t.engines[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(context.putImageData).not.toHaveBeenCalled()
  })

  it('a draw that resolves after destroy does not touch its canvas', async () => {
    const gate = deferred<void>()
    // This render ignores its signal and finishes anyway.
    const t = setup({
      render: (_, __, options) => gate.promise.then(() => bitmap(options)),
    })
    const reader = await t.open()
    const { canvas, raw, context } = fakeCanvas()
    const drawing = reader.draw(request(), canvas)
    await vi.waitFor(() => expect(t.renders).toHaveLength(1))
    const destroying = reader.destroy()
    gate.resolve()
    await expect(drawing).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await destroying
    expect(context.putImageData).not.toHaveBeenCalled()
    expect([raw.width, raw.height]).toEqual([300, 150])
  })

  it('a draw after destroy rejects at once', async () => {
    const t = setup()
    const reader = await t.open()
    await reader.destroy()
    await expect(reader.draw(request(), fakeCanvas().canvas)).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    expect(t.renders).toHaveLength(0)
  })

  it('a replacement engine still starting is freed once it has started', async () => {
    const t = setup({
      render: (call, _, options) =>
        call === 1
          ? Promise.reject(engineError('engine-failure'))
          : Promise.resolve(bitmap(options)),
    })
    const reader = await t.open()
    const starting = deferred<void>()
    const make = t.createEngine.getMockImplementation()!
    t.createEngine.mockImplementationOnce(async () => {
      await starting.promise
      return make()
    })
    const drawing = reader.draw(request(), fakeCanvas().canvas)
    await vi.waitFor(() => expect(t.createEngine).toHaveBeenCalledTimes(2))
    const destroying = reader.destroy()
    starting.resolve()
    await expect(drawing).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await destroying
    await vi.waitFor(() => expect(t.engines[1]?.destroy).toHaveBeenCalledTimes(1))
    expect(t.engines[1]!.doc.close).toHaveBeenCalledTimes(1)
    expect(t.engines[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(t.renders).toHaveLength(1)
  })
})

describe('text', () => {
  it("builds the page's runs from the engine's characters", async () => {
    const t = setup()
    const reader = await t.open()
    const content = await reader.text(0, { glyphs: false })
    expect(content.page).toBe(0)
    expect(content.items).toMatchObject([
      { str: 'Hi', dir: 'ltr', fontName: 'Courier', fontSize: 12, hasEOL: true },
    ])
    expect(content.items[0]!.advances).toEqual([0, 0.5, 1])
    await expect(reader.textFamilies(0)).resolves.toEqual(['monospace'])
  })

  it('reads a page once for two reads of it, and for its families', async () => {
    const t = setup()
    const reader = await t.open()
    const first = await reader.text(0, { glyphs: false })
    const again = await reader.text(0, { glyphs: true })
    await reader.textFamilies(0)
    expect(again).toEqual(first)
    expect(t.engines[0]!.doc.pageText).toHaveBeenCalledTimes(1)
  })

  it('gives each read an object and list of its own, so a caller that edits them changes no other', async () => {
    const t = setup()
    const reader = await t.open()
    const first = await reader.text(0, { glyphs: false })
    const kept = structuredClone(first)
    first.items.reverse()
    first.items.push(first.items[0]!)
    ;(first as { page: number }).page = 7
    const again = await reader.text(0, { glyphs: false })
    expect(again).not.toBe(first)
    expect(again.items).not.toBe(first.items)
    expect(again).toEqual(kept)
    expect(t.engines[0]!.doc.pageText).toHaveBeenCalledTimes(1)
  })

  describe('a read with a signal', () => {
    /** A reader whose engine answers a text read only once `gate` opens. */
    async function gated() {
      const gate = deferred<void>()
      const t = setup({ pageText: () => gate.promise.then(() => hiText()) })
      const reader = await t.open()
      const pageText = t.engines[0]!.doc.pageText
      /** The signal the engine was given for its `n`th text read. */
      const engineSignal = (n = 0) => pageText.mock.calls[n]![1]!.signal!
      return { t, reader, gate, pageText, engineSignal }
    }

    it('rejects with the reason of a signal aborted before it, and asks the engine nothing', async () => {
      const { reader, pageText } = await gated()
      const reason = new Error('moved on')
      await expect(
        reader.text(0, { glyphs: false, signal: AbortSignal.abort(reason) })
      ).rejects.toBe(reason)
      await expect(reader.textFamilies(0, AbortSignal.abort(reason))).rejects.toBe(reason)
      expect(pageText).not.toHaveBeenCalled()
    })

    it("cancels the engine's read when its only caller aborts, and a later read asks again", async () => {
      const { reader, gate, pageText, engineSignal } = await gated()
      const c = new AbortController()
      const reason = new Error('moved on')
      const reading = reader.text(0, { glyphs: false, signal: c.signal })
      await vi.waitFor(() => expect(pageText).toHaveBeenCalledTimes(1))
      c.abort(reason)
      await expect(reading).rejects.toBe(reason)
      expect(engineSignal().aborted).toBe(true)
      const later = reader.text(0, { glyphs: false })
      await vi.waitFor(() => expect(pageText).toHaveBeenCalledTimes(2))
      gate.resolve()
      await expect(later).resolves.toMatchObject({ items: [{ str: 'Hi' }] })
    })

    it('leaves the read to the callers still waiting when one aborts', async () => {
      const { reader, gate, pageText, engineSignal } = await gated()
      const one = new AbortController()
      const two = new AbortController()
      const reason = new Error('moved on')
      const first = reader.text(0, { glyphs: false, signal: one.signal })
      const second = reader.text(0, { glyphs: false, signal: two.signal })
      const families = reader.textFamilies(0, two.signal)
      await vi.waitFor(() => expect(pageText).toHaveBeenCalledTimes(1))
      one.abort(reason)
      await expect(first).rejects.toBe(reason)
      expect(engineSignal().aborted).toBe(false)
      gate.resolve()
      await expect(second).resolves.toMatchObject({ items: [{ str: 'Hi' }] })
      await expect(families).resolves.toEqual(['monospace'])
      // The read was kept: the aborted caller did not spoil it for later ones.
      await expect(reader.text(0, { glyphs: false })).resolves.toMatchObject({
        items: [{ str: 'Hi' }],
      })
      expect(pageText).toHaveBeenCalledTimes(1)
    })

    it('never cancels a read a caller with no signal waits on', async () => {
      const { reader, gate, pageText, engineSignal } = await gated()
      const c = new AbortController()
      const plain = reader.textFamilies(0)
      const signalled = reader.text(0, { glyphs: false, signal: c.signal })
      await vi.waitFor(() => expect(pageText).toHaveBeenCalledTimes(1))
      c.abort()
      await expect(signalled).rejects.toMatchObject({ name: 'AbortError' })
      expect(engineSignal().aborted).toBe(false)
      gate.resolve()
      await expect(plain).resolves.toEqual(['monospace'])
    })

    it('cancels the read once every caller waiting on it has aborted', async () => {
      const { reader, gate, pageText, engineSignal } = await gated()
      const one = new AbortController()
      const two = new AbortController()
      const first = reader.text(0, { glyphs: false, signal: one.signal })
      const second = reader.textFamilies(0, two.signal)
      await vi.waitFor(() => expect(pageText).toHaveBeenCalledTimes(1))
      one.abort()
      await expect(first).rejects.toMatchObject({ name: 'AbortError' })
      expect(engineSignal().aborted).toBe(false)
      two.abort()
      await expect(second).rejects.toMatchObject({ name: 'AbortError' })
      expect(engineSignal().aborted).toBe(true)
      // A caller that comes after starts a read of its own.
      const later = reader.text(0, {
        glyphs: false,
        signal: new AbortController().signal,
      })
      await vi.waitFor(() => expect(pageText).toHaveBeenCalledTimes(2))
      expect(engineSignal(1).aborted).toBe(false)
      gate.resolve()
      await expect(later).resolves.toMatchObject({ items: [{ str: 'Hi' }] })
    })

    it('does not replace the engine for a read its callers cancelled', async () => {
      const { t, reader, pageText } = await gated()
      await reader.pageInfo(0)
      const c = new AbortController()
      const reading = reader.text(0, { glyphs: false, signal: c.signal })
      await vi.waitFor(() => expect(pageText).toHaveBeenCalledTimes(1))
      c.abort()
      await expect(reading).rejects.toMatchObject({ name: 'AbortError' })
      await new Promise((resolve) => setTimeout(resolve))
      expect(t.createEngine).toHaveBeenCalledTimes(1)
      expect(pageText).toHaveBeenCalledTimes(1)
    })

    it('reads as with no signal when its signal does not abort', async () => {
      const t = setup()
      const reader = await t.open()
      expect(
        await reader.text(0, { glyphs: false, signal: new AbortController().signal })
      ).toEqual(await reader.text(0, { glyphs: false }))
    })
  })

  it('keeps the last eight pages read', async () => {
    const t = setup({ pageCount: 10 })
    const reader = await t.open()
    const pageText = t.engines[0]!.doc.pageText
    for (let page = 0; page < 9; page++) await reader.text(page, { glyphs: false })
    expect(pageText).toHaveBeenCalledTimes(9)
    // Page 0 has gone; pages 1 to 8 are kept, and reading one keeps it longest.
    await reader.text(8, { glyphs: false })
    await reader.text(1, { glyphs: false })
    expect(pageText).toHaveBeenCalledTimes(9)
    await reader.text(0, { glyphs: false })
    expect(pageText).toHaveBeenCalledTimes(10)
    // Reading page 0 again let go of page 2, the one read longest ago; page 1 stayed.
    await reader.text(1, { glyphs: false })
    expect(pageText).toHaveBeenCalledTimes(10)
    await reader.text(2, { glyphs: false })
    expect(pageText).toHaveBeenCalledTimes(11)
  })

  it('does not keep a failed read', async () => {
    const cannot = engineError('engine-failure')
    let calls = 0
    const t = setup({
      traps: false,
      pageText: () =>
        ++calls === 1 ? Promise.reject(cannot) : Promise.resolve(hiText()),
    })
    const reader = await t.open()
    await reader.pageInfo(0)
    await expect(reader.text(0, { glyphs: false })).rejects.toBe(cannot)
    await expect(reader.text(0, { glyphs: false })).resolves.toMatchObject({
      items: [{ str: 'Hi' }],
    })
    expect(t.createEngine).toHaveBeenCalledTimes(1)
  })

  it('rejects with PageOutOfRange for a page the file does not have', async () => {
    const t = setup()
    const reader = await t.open()
    await expect(reader.text(1, { glyphs: false })).rejects.toMatchObject({
      code: 'PageOutOfRange',
    })
    await expect(reader.textFamilies(-1)).rejects.toMatchObject({
      code: 'PageOutOfRange',
    })
    expect(t.engines[0]!.doc.pageText).not.toHaveBeenCalled()
  })

  it('replaces an engine that stops and reads once more, as a draw does', async () => {
    const t = setup({
      pageText: (_, engine) =>
        engine.index === 0
          ? Promise.reject(engineError('engine-failure'))
          : Promise.resolve(hiText()),
    })
    const reader = await t.open()
    await expect(reader.text(0, { glyphs: false })).resolves.toMatchObject({
      items: [{ str: 'Hi' }],
    })
    expect(t.createEngine).toHaveBeenCalledTimes(2)
    expect(t.engines[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(t.engines[1]!.open).toHaveBeenCalledTimes(1)
    expect(t.engines[1]!.doc.pageText).toHaveBeenCalledWith(0, {
      signal: expect.any(AbortSignal) as AbortSignal,
    })
  })

  it('rejects on a second failure, without a third engine', async () => {
    const t = setup({ pageText: () => Promise.reject(engineError('engine-failure')) })
    const reader = await t.open()
    await expect(reader.text(0, { glyphs: false })).rejects.toMatchObject({
      code: 'engine-failure',
    })
    expect(t.createEngine).toHaveBeenCalledTimes(2)
  })

  it('rejects with DocumentDestroyed after destroy', async () => {
    const t = setup()
    const reader = await t.open()
    await reader.destroy()
    await expect(reader.text(0, { glyphs: false })).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    await expect(reader.textFamilies(0)).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    expect(t.engines[0]!.doc.pageText).not.toHaveBeenCalled()
  })

  it('rejects a read running at destroy with DocumentDestroyed', async () => {
    const gate = deferred<void>()
    const t = setup({ pageText: () => gate.promise.then(() => hiText()) })
    const reader = await t.open()
    const reading = reader.text(0, { glyphs: false })
    await vi.waitFor(() => expect(t.engines[0]!.doc.pageText).toHaveBeenCalled())
    const destroying = reader.destroy()
    gate.resolve()
    await expect(reading).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await destroying
  })
})

describe('links, the outline and destinations', () => {
  const ascii = (text: string) => new TextEncoder().encode(text)
  const oneLink = (): Promise<PageLinksResult> =>
    Promise.resolve({
      annotations: [
        {
          index: 0,
          subtype: 'Link',
          flags: 4,
          objectNumber: 9,
          generation: 0,
          rectOk: true,
          hasQuads: false,
          quadsOk: true,
        },
      ],
      links: [
        {
          index: 0,
          rect: { x: 72, y: 700, width: 100, height: 20 },
          destination: explicitDest(0, 'XYZ', [72, 600]),
        },
      ],
    })

  it("reads a page's links from the engine", async () => {
    const t = setup({ pageLinks: oneLink })
    const reader = await t.open()
    await expect(reader.links(0)).resolves.toEqual([
      {
        id: 'pdf:0:9R',
        page: 0,
        rect: { x: 72, y: 700, width: 100, height: 20 },
        order: 0,
        target: { kind: 'dest', raw: [0, { name: 'XYZ' }, 72, 600] },
      },
    ])
    expect(t.engines[0]!.doc.pageLinks).toHaveBeenCalledWith(0)
  })

  it('replaces an engine that stops and reads the links once more', async () => {
    const t = setup({
      pageLinks: (_, engine) =>
        engine.index === 0 ? Promise.reject(engineError('engine-failure')) : oneLink(),
    })
    const reader = await t.open()
    await expect(reader.links(0)).resolves.toHaveLength(1)
    expect(t.createEngine).toHaveBeenCalledTimes(2)
    expect(t.engines[1]!.doc.pageLinks).toHaveBeenCalledWith(0)
  })

  it('gives no links for a page whose links cannot be read, as the PDF.js reader does', async () => {
    const t = setup({ pageLinks: () => Promise.reject(engineError('engine-failure')) })
    const reader = await t.open()
    await expect(reader.links(0)).resolves.toEqual([])
  })

  /** Every page's link count, read 8 at a time as the document reads them at open. */
  const linksAtOpen = async (pageCount: number, trapping: (page: number) => boolean) => {
    const t = setup({ pageCount, pageLinks: oneQueue(trapping, oneLink) })
    const reader = await t.open()
    await reader.pageInfo(0)
    const found = await mapInOrder(
      pageCount,
      8,
      async (page) => (await reader.links(page)).length
    )
    return { t, found }
  }

  it('reads every other page of a file in which one page stops the engine, 8 at a time', async () => {
    const { t, found } = await linksAtOpen(40, (page) => page === 3)
    // Pages 0 to 2 are read before page 3 stops the engine. Pages 3 to 10 have none: page 3,
    // and the seven read at the same time, queued behind it when it stops the first engine and
    // again on the second, which its retry stops. Pages from 11 on find the second engine
    // stopped, drop it and read on a third.
    expect(found).toEqual([
      1,
      1,
      1,
      ...Array<number>(8).fill(0),
      ...Array<number>(29).fill(1),
    ])
    expect(t.createEngine).toHaveBeenCalledTimes(3)
  })

  it('stops asking for links once link reads have stopped three engines in a row', async () => {
    const { t, found } = await linksAtOpen(40, () => true)
    expect(found).toEqual(Array<number>(40).fill(0))
    // The engine the file opened in, then one for each of the three it dropped; then no more.
    expect(t.createEngine).toHaveBeenCalledTimes(4)
  })

  it('reads the links of the pages after one whose read stopped the engine', async () => {
    const t = setup({
      pageCount: 50,
      pageLinks: (index) =>
        index === 0 ? Promise.reject(engineError('engine-failure')) : oneLink(),
    })
    const reader = await t.open()
    await reader.pageInfo(0)
    await expect(reader.links(0)).resolves.toEqual([])
    for (let page = 1; page < 50; page++)
      await expect(reader.links(page)).resolves.toHaveLength(1)
  })

  it('counts only reads in a row: one that succeeds starts the count again', async () => {
    const trapping = new Set([0, 2, 4, 6])
    const t = setup({
      pageCount: 8,
      pageLinks: (index) =>
        trapping.has(index) ? Promise.reject(engineError('engine-failure')) : oneLink(),
    })
    const reader = await t.open()
    await reader.pageInfo(0)
    const found = []
    for (let page = 0; page < 8; page++) found.push((await reader.links(page)).length)
    expect(found).toEqual([0, 1, 0, 1, 0, 1, 0, 1])
  })

  it('rejects with PageOutOfRange, and after destroy with DocumentDestroyed', async () => {
    const t = setup()
    const reader = await t.open()
    await expect(reader.links(1)).rejects.toMatchObject({ code: 'PageOutOfRange' })
    await reader.destroy()
    await expect(reader.links(0)).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await expect(reader.outline()).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await expect(reader.resolveDestination('a')).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    expect(t.engines[0]!.doc.pageLinks).not.toHaveBeenCalled()
  })

  it('resolves an explicit destination without the engine; one naming no page to nothing', async () => {
    const t = setup({ pageCount: 3 })
    const reader = await t.open()
    await expect(
      reader.resolveDestination([2, { name: 'XYZ' }, 72, 600, null])
    ).resolves.toEqual({ page: 2, fit: 'xyz', left: 72, top: 600, zoom: undefined })
    await expect(
      reader.resolveDestination([-1, { name: 'Fit' }])
    ).resolves.toBeUndefined()
    await expect(reader.resolveDestination([3, { name: 'Fit' }])).resolves.toBeUndefined()
    expect(t.engines[0]!.doc.namedDestination).not.toHaveBeenCalled()
  })

  it('gives a page reference as PDF.js does, { num, gen }, and resolves it again', async () => {
    const byRef = (page: number, objectNumber: number) =>
      explicitDest(page, 'FitH', [500], {
        pageRef: { objectNumber, generation: 0 },
        pageKind: page < 0 ? 'other' : 'ref',
      })
    const t = setup({
      pageCount: 3,
      pageLinks: () =>
        Promise.resolve({
          annotations: [0, 1].map((index) => ({
            index,
            subtype: 'Link',
            flags: 4,
            objectNumber: 20 + index,
            generation: 0,
            rectOk: true,
            hasQuads: false,
            quadsOk: true,
          })),
          links: [
            {
              index: 0,
              rect: { x: 0, y: 0, width: 9, height: 9 },
              destination: byRef(2, 7),
            },
            {
              index: 1,
              rect: { x: 0, y: 0, width: 9, height: 9 },
              destination: byRef(-1, 99),
            },
          ],
        }),
    })
    const reader = await t.open()
    const [toPage, toNothing] = await reader.links(0)
    expect(toPage!.target).toEqual({
      kind: 'dest',
      raw: [{ num: 7, gen: 0 }, { name: 'FitH' }, 500],
    })
    // A copy resolves as well as the array the link gave: the reference is looked up by value.
    const raw = JSON.parse(
      JSON.stringify((toPage!.target as { raw: readonly unknown[] }).raw)
    ) as unknown[]
    await expect(reader.resolveDestination(raw)).resolves.toEqual({
      page: 2,
      fit: 'fith',
      top: 500,
    })
    // A reference to no page resolves to nothing, and so does one the reader never gave.
    await expect(
      reader.resolveDestination((toNothing!.target as { raw: readonly unknown[] }).raw)
    ).resolves.toBeUndefined()
    await expect(
      reader.resolveDestination([{ num: 8, gen: 0 }, { name: 'Fit' }])
    ).resolves.toBeUndefined()
  })

  it('looks a name up in the engine by the bytes it was read from, once per name', async () => {
    const t = setup({
      pageCount: 2,
      namedDestination: (name) =>
        Promise.resolve(
          new TextDecoder().decode(name) === 'chapter-2'
            ? explicitDest(1, 'FitH', [500])
            : undefined
        ),
    })
    const reader = await t.open()
    const named = t.engines[0]!.doc.namedDestination
    await expect(reader.resolveDestination('chapter-2')).resolves.toEqual({
      page: 1,
      fit: 'fith',
      top: 500,
    })
    await expect(reader.resolveDestination('chapter-2')).resolves.toEqual({
      page: 1,
      fit: 'fith',
      top: 500,
    })
    await expect(reader.resolveDestination('missing')).resolves.toBeUndefined()
    expect(named).toHaveBeenCalledTimes(2)
    expect(named.mock.calls[0]![0]).toEqual(ascii('chapter-2'))
    // A name outside PDFDocEncoding goes as UTF-16BE, as the file would hold it.
    await reader.resolveDestination('章')
    expect([...named.mock.calls[2]![0]]).toEqual([0xfe, 0xff, 0x7a, 0xe0])
  })

  it('a name whose destination names no page, or is malformed, resolves to nothing', async () => {
    const t = setup({
      namedDestination: (name) =>
        Promise.resolve(
          new TextDecoder().decode(name) === 'nowhere'
            ? explicitDest(-1, 'Fit')
            : explicitDest(0, 'Unknown')
        ),
    })
    const reader = await t.open()
    await expect(reader.resolveDestination('nowhere')).resolves.toBeUndefined()
    await expect(reader.resolveDestination('odd')).resolves.toBeUndefined()
  })

  it('a lookup a working engine cannot do resolves to nothing, and is kept', async () => {
    const t = setup({
      traps: false,
      namedDestination: () => Promise.reject(new Error('cannot read')),
    })
    const reader = await t.open()
    await reader.pageInfo(0)
    for (let i = 0; i < 3; i++)
      await expect(reader.resolveDestination('a')).resolves.toBeUndefined()
    expect(t.engines[0]!.doc.namedDestination).toHaveBeenCalledTimes(1)
    expect(t.createEngine).toHaveBeenCalledTimes(1)
  })

  it('a lookup that failed as engines stopped is asked again, and kept once it succeeds', async () => {
    // The first two engines stop on the lookup; the third answers it.
    const t = setup({
      namedDestination: (_, engine) =>
        engine.index < 2
          ? Promise.reject(engineError('engine-failure'))
          : Promise.resolve(explicitDest(0, 'Fit')),
    })
    const reader = await t.open()
    await reader.pageInfo(0)
    await expect(reader.resolveDestination('a')).rejects.toMatchObject({
      code: 'engine-failure',
    })
    await expect(reader.resolveDestination('a')).resolves.toEqual({ page: 0, fit: 'fit' })
    await expect(reader.resolveDestination('a')).resolves.toEqual({ page: 0, fit: 'fit' })
    expect(t.engines[2]!.doc.namedDestination).toHaveBeenCalledTimes(1)
    expect(t.createEngine).toHaveBeenCalledTimes(3)
  })

  it('reads the outline from the engine, each destination resolved', async () => {
    const t = setup({
      pageCount: 2,
      outline: () =>
        Promise.resolve({
          items: [
            {
              title: 'Cover',
              bold: false,
              italic: false,
              count: 0,
              children: [],
              destination: explicitDest(0, 'Fit'),
            },
            {
              title: 'Chapter 2',
              bold: true,
              italic: false,
              count: 0,
              children: [],
              action: { kind: 'GoTo', destination: { name: ascii('chapter-2') } },
            },
          ],
          // A cut-short outline is given as far as it goes.
          truncated: true,
        }),
      namedDestination: () => Promise.resolve(explicitDest(1, 'Fit')),
    })
    const reader = await t.open()
    const outline = await reader.outline()
    expect(outline.map((o) => [o.id, o.title, o.target])).toEqual([
      ['0', 'Cover', { kind: 'resolved', dest: { page: 0, fit: 'fit' } }],
      ['1', 'Chapter 2', { kind: 'resolved', dest: { page: 1, fit: 'fit' } }],
    ])
  })

  /**
   * An outline of 40 items, each going to the name `name-<i>`, whose lookups the engine answers
   * one at a time; the lookup of a name `trapping` picks stops the engine.
   */
  const namedOutline = async (trapping: (i: number) => boolean) => {
    const index = (name: Uint8Array) => Number(new TextDecoder().decode(name).slice(5))
    const t = setup({
      pageCount: 2,
      outline: () =>
        Promise.resolve({
          items: Array.from({ length: 40 }, (_, i) => ({
            title: `Item ${i}`,
            bold: false,
            italic: false,
            count: 0,
            children: [],
            destination: { name: ascii(`name-${i}`) },
          })),
          truncated: false,
        }),
      namedDestination: oneQueue(
        (name: Uint8Array) => trapping(index(name)),
        () => Promise.resolve(explicitDest(1, 'Fit'))
      ),
    })
    const reader = await t.open()
    await reader.pageInfo(0)
    return { t, reader }
  }

  it('resolves every other name of an outline in which one name stops the engine', async () => {
    const { t, reader } = await namedOutline((i) => i === 3)
    const outline = await reader.outline()
    // As for links read 8 at a time: names 3 to 10 resolve to nothing, name 3 and the seven
    // looked up with it on the engine it stopped and on the one its retry stopped.
    expect(outline.map((o) => o.target.kind)).toEqual([
      ...Array<string>(3).fill('resolved'),
      ...Array<string>(8).fill('unsupported'),
      ...Array<string>(29).fill('resolved'),
    ])
    expect(t.createEngine).toHaveBeenCalledTimes(3)
  })

  it('stops looking names up once lookups have stopped three engines in a row, within one outline read', async () => {
    const { t, reader } = await namedOutline(() => true)
    const outline = await reader.outline()
    expect(outline).toHaveLength(40)
    expect(outline.every((o) => o.target.kind === 'unsupported')).toBe(true)
    // The engine the file opened in, then one for each of the three the lookups dropped.
    // Asking every name would start a new engine for each batch of lookups that run at once.
    expect(t.createEngine).toHaveBeenCalledTimes(4)
    // A later read asks again.
    const asked = t.createEngine.mock.calls.length
    await reader.outline()
    expect(t.createEngine.mock.calls.length).toBeGreaterThan(asked)
  })

  it('keeps looking names up when one fails while the engine still works', async () => {
    const t = setup({
      traps: false,
      pageCount: 2,
      outline: () =>
        Promise.resolve({
          items: ['bad', 'good'].map((name) => ({
            title: name,
            bold: false,
            italic: false,
            count: 0,
            children: [],
            destination: { name: ascii(name) },
          })),
          truncated: false,
        }),
      namedDestination: (name) =>
        new TextDecoder().decode(name) === 'bad'
          ? Promise.reject(engineError('engine-failure'))
          : Promise.resolve(explicitDest(1, 'Fit')),
    })
    const reader = await t.open()
    await reader.pageInfo(0)
    const outline = await reader.outline()
    expect(outline.map((o) => o.target)).toEqual([
      { kind: 'unsupported', reason: 'unknown' },
      { kind: 'resolved', dest: { page: 1, fit: 'fit' } },
    ])
    expect(t.createEngine).toHaveBeenCalledTimes(1)
  })

  it('an outline that cannot be read rejects, as the PDF.js reader does', async () => {
    const t = setup({ outline: () => Promise.reject(new Error('cannot read')) })
    const reader = await t.open()
    await expect(reader.outline()).rejects.toThrow('cannot read')
  })
})

/** What the fallback reader answers, told apart from the engine's by its values. */
const fallbackText = { page: 0, items: [] }
const fallbackLink = {
  id: 'pdf:0:1R',
  page: 0,
  rect: { x: 0, y: 0, width: 1, height: 1 },
  target: { kind: 'named', action: 'NextPage' } as const,
}
const fallbackOutline = [
  {
    id: '0',
    title: 'From the fallback',
    target: { kind: 'named', action: 'FirstPage' } as const,
    bold: false,
    italic: false,
    open: false,
    children: [],
  },
]
const fallbackFacts = {
  index: 0,
  box: { x: 0, y: 0, width: 100, height: 100 },
  rotate: 0,
  userUnit: 1,
  width: 100,
  height: 100,
} as const
const fileFacts = { title: 'From the fallback', encrypted: false }
const fileAnnotation = {
  id: '9R',
  subtype: 'Square',
  rect: [0, 0, 10, 10] as [number, number, number, number],
  hasAppearance: false,
}
const fileField = {
  name: 'name',
  kind: 'text' as const,
  flags: 0,
  widgets: [],
}
const fileScripts = {
  calculationOrder: ['total'],
  calculationOrderIds: ['15R'],
  document: [{ name: 'init', source: 'var ready = true' }],
  documentActions: {},
}
const pageScripts = { PageOpen: ['var opened = true'] }
const sandboxFields = new Map([['total', [{ id: '15R' }]]])
const fallback = () => ({
  kind: 'pdfjs' as const,
  pageCount: 2,
  facts: vi.fn(() => Promise.resolve(fileFacts)),
  annotations: vi.fn((_: number) => Promise.resolve([fileAnnotation])),
  form: vi.fn(() => Promise.resolve([fileField])),
  tabOrder: vi.fn((_: number) => Promise.resolve(['9R'])),
  scripts: vi.fn(() => Promise.resolve(fileScripts)),
  pageScripts: vi.fn((_: number) => Promise.resolve(pageScripts)),
  sandboxFields: vi.fn(() => Promise.resolve(sandboxFields)),
  pageInfo: vi.fn((_: number) => Promise.resolve(fallbackFacts)),
  draw: vi.fn(() => Promise.resolve()),
  drawFields: vi.fn((..._: unknown[]) => Promise.resolve(new Set(['9R']))),
  text: vi.fn(() => Promise.resolve(fallbackText)),
  links: vi.fn(() => Promise.resolve([fallbackLink])),
  outline: vi.fn(() => Promise.resolve(fallbackOutline)),
  resolveDestination: vi.fn(() => Promise.resolve({ page: 1, fit: 'fit' as const })),
  destroy: vi.fn(() => Promise.resolve()),
})

describe('an engine that cannot start', () => {
  /**
   * A two-page file whose first engine stops on its first text read, and whose replacement
   * cannot start.
   */
  const stopsThenCannotStart = async (withFallback = true) => {
    const t = setup({
      pageCount: 2,
      pageText: () => Promise.reject(engineError('engine-failure')),
    })
    const instead = fallback()
    const reader = await createEngineReader({
      loader: t.loader as unknown as EngineLoader,
      bytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      password: undefined,
      warn: t.warn,
      ...(withFallback && { fallback: instead }),
    })
    // A page the engine has read, so the reader can tell the engine stopped.
    await reader.pageInfo(0)
    const real = t.createEngine.getMockImplementation()!
    t.createEngine.mockImplementation(() => {
      if (t.createEngine.mock.calls.length > 1)
        return Promise.reject(new Error('no wasm'))
      return real()
    })
    return { t, reader, instead }
  }

  it('a text read whose engine stopped and could not be replaced comes from the fallback', async () => {
    const { t, reader, instead } = await stopsThenCannotStart()
    await expect(reader.text(1, { glyphs: true })).resolves.toBe(fallbackText)
    expect(instead.text).toHaveBeenCalledWith(1, { glyphs: true })
    expect(t.createEngine).toHaveBeenCalledTimes(2)
  })

  it('then text, links, the outline, names and pixels come from the fallback, with no engine started again', async () => {
    const { t, reader, instead } = await stopsThenCannotStart()
    await reader.text(0, { glyphs: false })
    expect(t.createEngine).toHaveBeenCalledTimes(2)
    for (let i = 0; i < 3; i++) {
      await expect(reader.text(0, { glyphs: false })).resolves.toBe(fallbackText)
      await expect(reader.links(1)).resolves.toEqual([fallbackLink])
      await expect(reader.outline()).resolves.toBe(fallbackOutline)
      await expect(reader.resolveDestination(`name-${i}`)).resolves.toEqual({
        page: 1,
        fit: 'fit',
      })
      const { canvas } = fakeCanvas()
      await reader.draw(request({ page: 1 }), canvas)
    }
    expect(instead.links).toHaveBeenCalledTimes(3)
    expect(instead.outline).toHaveBeenCalledTimes(3)
    expect(instead.resolveDestination).toHaveBeenCalledTimes(3)
    expect(instead.draw).toHaveBeenCalledTimes(3)
    // An explicit destination needs no reader.
    await expect(reader.resolveDestination([1, { name: 'Fit' }])).resolves.toEqual({
      page: 1,
      fit: 'fit',
    })
    expect(instead.resolveDestination).toHaveBeenCalledTimes(3)
    // A page reference the engine never gave, as the fallback's own links give, goes to it.
    const fallbackRaw = [{ num: 5, gen: 0 }, { name: 'Fit' }]
    await expect(reader.resolveDestination(fallbackRaw)).resolves.toEqual({
      page: 1,
      fit: 'fit',
    })
    expect(instead.resolveDestination).toHaveBeenLastCalledWith(fallbackRaw)
    // Facts the engine gave are kept; a page it never gave comes from the fallback.
    await expect(reader.pageInfo(0)).resolves.toMatchObject({ width: 612 })
    await expect(reader.pageInfo(1)).resolves.toBe(fallbackFacts)
    expect(t.createEngine).toHaveBeenCalledTimes(2)
  })

  it('the text has no families once it comes from the fallback', async () => {
    const { reader } = await stopsThenCannotStart()
    await expect(reader.textFamilies(0)).resolves.toEqual([])
  })

  it('a call aborted, or made after destroy, does not reach the fallback', async () => {
    const { reader, instead } = await stopsThenCannotStart()
    await reader.text(0, { glyphs: false })
    instead.text.mockClear()
    const reason = new Error('moved on')
    const c = new AbortController()
    c.abort(reason)
    await expect(reader.text(0, { glyphs: false, signal: c.signal })).rejects.toBe(reason)
    await reader.destroy()
    await expect(reader.text(0, { glyphs: false })).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    await expect(reader.outline()).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    expect(instead.text).not.toHaveBeenCalled()
    expect(instead.outline).not.toHaveBeenCalled()
  })

  it('drops the text it kept, and tells the host once', async () => {
    const t = setup({
      pageCount: 2,
      pageText: (index) =>
        index === 0
          ? Promise.resolve(hiText())
          : Promise.reject(engineError('engine-failure')),
    })
    const instead = fallback()
    const onFallback = vi.fn()
    const reader = await createEngineReader({
      loader: t.loader as unknown as EngineLoader,
      bytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      password: undefined,
      warn: t.warn,
      fallback: instead,
      onFallback,
    })
    await reader.pageInfo(0)
    // Page 0 is read by the engine and kept.
    const engineText = await reader.text(0, { glyphs: false })
    expect(engineText.items.map((i) => i.str).join('')).toContain('Hi')
    t.createEngine.mockImplementation(() => Promise.reject(new Error('no wasm')))
    await expect(reader.text(1, { glyphs: false })).resolves.toBe(fallbackText)
    // Page 0, read again, is the fallback's too.
    await expect(reader.text(0, { glyphs: false })).resolves.toBe(fallbackText)
    await reader.text(1, { glyphs: false })
    expect(onFallback).toHaveBeenCalledTimes(1)
  })

  it('a fallback call running at destroy rejects with DocumentDestroyed', async () => {
    const { reader, instead } = await stopsThenCannotStart()
    await reader.text(0, { glyphs: false })
    const text = deferred<typeof fallbackText>()
    const facts = deferred<typeof fallbackFacts>()
    const draw = deferred<void>()
    instead.text.mockReturnValueOnce(text.promise)
    instead.pageInfo.mockReturnValueOnce(facts.promise)
    instead.draw.mockReturnValueOnce(draw.promise)
    const reading = reader.text(1, { glyphs: false })
    const asking = reader.pageInfo(1)
    const { canvas } = fakeCanvas()
    const drawing = reader.draw(request({ page: 1 }), canvas)
    // Let each call reach the fallback before the reader goes.
    await vi.waitFor(() => expect(instead.draw).toHaveBeenCalled())
    await reader.destroy()
    const destroyedError = { code: 'DocumentDestroyed' }
    await expect(reading).rejects.toMatchObject(destroyedError)
    await expect(asking).rejects.toMatchObject(destroyedError)
    await expect(drawing).rejects.toMatchObject(destroyedError)
    // Settling after destroy changes nothing.
    text.resolve(fallbackText)
    facts.resolve(fallbackFacts)
    draw.reject(new Error('worker gone'))
  })

  it('page facts still being read when the engine cannot start come from the fallback', async () => {
    const t = setup({
      pageCount: 2,
      pageText: () => Promise.reject(engineError('engine-failure')),
    })
    const instead = fallback()
    const reader = await createEngineReader({
      loader: t.loader as unknown as EngineLoader,
      bytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      password: undefined,
      warn: t.warn,
      fallback: instead,
    })
    await reader.pageInfo(0)
    // Page 1's facts are still on their way from the first engine when it stops.
    const slow = deferred<Awaited<ReturnType<ReaderEngineDocument['pageInfo']>>>()
    t.engines[0]!.doc.pageInfo.mockImplementationOnce(() => slow.promise)
    const first = reader.pageInfo(1)
    t.createEngine.mockImplementation(() => Promise.reject(new Error('no wasm')))
    await expect(reader.text(0, { glyphs: false })).resolves.toBe(fallbackText)
    // The engine cannot start; page 1's read on the stopped engine has not failed yet.
    const second = reader.pageInfo(1)
    slow.reject(engineError('engine-failure'))
    await expect(first).resolves.toBe(fallbackFacts)
    await expect(second).resolves.toBe(fallbackFacts)
  })

  it('without a fallback, calls reject with why the engine did not start, and none starts it again', async () => {
    const { t, reader } = await stopsThenCannotStart(false)
    const notStarted = { code: 'SaveFailed', details: { stage: 'engine' } }
    await expect(reader.text(0, { glyphs: false })).rejects.toMatchObject(notStarted)
    await expect(reader.text(1, { glyphs: false })).rejects.toMatchObject(notStarted)
    await expect(reader.outline()).rejects.toMatchObject(notStarted)
    await expect(reader.resolveDestination('a')).rejects.toMatchObject(notStarted)
    await expect(reader.links(1)).resolves.toEqual([])
    const { canvas } = fakeCanvas()
    await expect(reader.draw(request({ page: 1 }), canvas)).rejects.toMatchObject(
      notStarted
    )
    expect(t.createEngine).toHaveBeenCalledTimes(2)
  })
})

const fieldRequest = {
  page: 0,
  look: 'own' as const,
  ids: new Set(['9R']),
  zoom: 1,
  rotation: 0 as const,
  pixelRatio: 1,
  x: 0,
  y: 0,
}

describe("the file's facts, annotations, form and scripts", () => {
  it("reads the file's facts, annotations, form, Tab order and scripts from the fallback while the engine works", async () => {
    const t = setup({ pageCount: 2 })
    const instead = fallback()
    const reader = await createEngineReader({
      loader: t.loader as unknown as EngineLoader,
      bytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      password: undefined,
      warn: t.warn,
      fallback: instead,
    })
    await expect(reader.facts()).resolves.toBe(fileFacts)
    await expect(reader.annotations(1)).resolves.toEqual([fileAnnotation])
    expect(instead.annotations).toHaveBeenCalledWith(1)
    await expect(reader.form()).resolves.toEqual([fileField])
    await expect(reader.tabOrder(1)).resolves.toEqual(['9R'])
    expect(instead.tabOrder).toHaveBeenCalledWith(1)
    await expect(reader.scripts()).resolves.toBe(fileScripts)
    await expect(reader.pageScripts(1)).resolves.toBe(pageScripts)
    expect(instead.pageScripts).toHaveBeenCalledWith(1)
    await expect(reader.sandboxFields()).resolves.toBe(sandboxFields)
    const fields = { ...fieldRequest }
    const { canvas } = fakeCanvas()
    const controller = new AbortController()
    await expect(reader.drawFields(fields, canvas, controller.signal)).resolves.toEqual(
      new Set(['9R'])
    )
    expect(instead.drawFields).toHaveBeenCalledWith(fields, canvas, controller.signal)
    await reader.destroy()
    await expect(reader.facts()).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await expect(reader.annotations(0)).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    await expect(reader.form()).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await expect(reader.tabOrder(0)).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await expect(reader.scripts()).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await expect(reader.pageScripts(0)).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    await expect(reader.sandboxFields()).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    await expect(reader.drawFields(fields, canvas)).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    expect(instead.facts).toHaveBeenCalledTimes(1)
    expect(instead.annotations).toHaveBeenCalledTimes(1)
    expect(instead.form).toHaveBeenCalledTimes(1)
    expect(instead.tabOrder).toHaveBeenCalledTimes(1)
    expect(instead.scripts).toHaveBeenCalledTimes(1)
    expect(instead.pageScripts).toHaveBeenCalledTimes(1)
    expect(instead.sandboxFields).toHaveBeenCalledTimes(1)
    expect(instead.drawFields).toHaveBeenCalledTimes(1)
  })

  it("without a fallback, the file's facts, annotations, form and scripts reject with EngineUnavailable", async () => {
    const t = setup({ pageCount: 2 })
    const reader = await createEngineReader({
      loader: t.loader as unknown as EngineLoader,
      bytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      password: undefined,
      warn: t.warn,
    })
    await expect(reader.facts()).rejects.toMatchObject({ code: 'EngineUnavailable' })
    await expect(reader.annotations(0)).rejects.toMatchObject({
      code: 'EngineUnavailable',
    })
    await expect(reader.form()).rejects.toMatchObject({ code: 'EngineUnavailable' })
    await expect(reader.tabOrder(0)).rejects.toMatchObject({ code: 'EngineUnavailable' })
    await expect(reader.scripts()).rejects.toMatchObject({ code: 'EngineUnavailable' })
    await expect(reader.pageScripts(0)).rejects.toMatchObject({
      code: 'EngineUnavailable',
    })
    await expect(reader.sandboxFields()).rejects.toMatchObject({
      code: 'EngineUnavailable',
    })
    await expect(
      reader.drawFields(fieldRequest, fakeCanvas().canvas)
    ).rejects.toMatchObject({
      code: 'EngineUnavailable',
    })
    await reader.destroy()
  })
})

describe('superseded draws', () => {
  it('twenty draws, each aborting the one before: only the last paints', async () => {
    const gate = deferred<void>()
    const t = setup({ render: (_, __, options) => abortable(options, gate.promise) })
    const reader = await t.open()
    const { canvas, context } = fakeCanvas()
    const controllers: AbortController[] = []
    const draws: Promise<void>[] = []
    for (let i = 0; i < 20; i++) {
      controllers[i - 1]?.abort()
      const controller = new AbortController()
      controllers.push(controller)
      const drawing = reader.draw(request(), canvas, controller.signal)
      // Observed now: the superseded ones reject while the loop goes on.
      drawing.catch(() => undefined)
      draws.push(drawing)
      await vi.waitFor(() => expect(t.renders).toHaveLength(i + 1))
    }
    gate.resolve()
    const results = await Promise.allSettled(draws)
    results.slice(0, 19).forEach((r, i) => {
      expect(r).toEqual({
        status: 'rejected',
        reason: controllers[i]!.signal.reason as unknown,
      })
    })
    expect(results[19]).toEqual({ status: 'fulfilled', value: undefined })
    expect(t.renders.filter((r) => r.options.signal?.aborted)).toHaveLength(19)
    expect(context.putImageData).toHaveBeenCalledTimes(1)
    expect(t.createEngine).toHaveBeenCalledTimes(1)
  })
})
