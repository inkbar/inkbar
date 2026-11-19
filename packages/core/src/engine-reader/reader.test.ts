import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { createEngineReader, MAX_PIXELS } from './reader'

import type { ReaderEngine, ReaderEngineDocument } from './types'
import type { EngineLoader } from '../model/save/saver'
import type { DrawRequest } from '../reader/types'
import type * as EngineModule from '@inkbar/engine'

type RenderOptions = Parameters<ReaderEngineDocument['renderPage']>[1]
type Rendered = Awaited<ReturnType<ReaderEngineDocument['renderPage']>>

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
  doc: Omit<ReaderEngineDocument, 'close' | 'pageInfo'> & {
    close: ReturnType<typeof vi.fn<ReaderEngineDocument['close']>>
    pageInfo: ReturnType<typeof vi.fn<ReaderEngineDocument['pageInfo']>>
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
