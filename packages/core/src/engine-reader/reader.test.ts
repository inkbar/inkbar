import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { InkError } from '../model/errors'
import { mapInOrder } from '../model/map-in-order'

import { createEngineReader, MAX_PIXELS } from './reader'
import { explicitDest } from './test-utils'

import type { CoreEngine, ReaderEngine, ReaderEngineDocument } from './types'
import type { DrawRequest, FieldDrawRequest } from '../reader/types'
import type * as EngineModule from '@inkbar/engine'

type RenderOptions = Parameters<ReaderEngineDocument['renderPage']>[1]
type FieldRenderOptions = Parameters<ReaderEngineDocument['renderAnnotations']>[1]
type FieldsRendered = Awaited<ReturnType<ReaderEngineDocument['renderAnnotations']>>
type Rendered = Awaited<ReturnType<ReaderEngineDocument['renderPage']>>
type PageTextResult = Awaited<ReturnType<ReaderEngineDocument['pageText']>>
type PageLinksResult = Awaited<ReturnType<ReaderEngineDocument['pageLinks']>>
type OutlineResult = Awaited<ReturnType<ReaderEngineDocument['outline']>>
type NamedResult = Awaited<ReturnType<ReaderEngineDocument['namedDestination']>>
type FactsResult = Awaited<ReturnType<ReaderEngineDocument['documentFacts']>>
type AnnotationsResult = Awaited<ReturnType<ReaderEngineDocument['pageAnnotations']>>
type FormResult = Awaited<ReturnType<ReaderEngineDocument['formFields']>>
type OrderResult = Awaited<ReturnType<ReaderEngineDocument['structureOrder']>>
type ScriptsResult = Awaited<ReturnType<ReaderEngineDocument['scripts']>>

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

const noScripts: ScriptsResult = {
  document: [],
  documentActions: {},
  pageActions: [],
  truncated: false,
}

const emptyForm: FormResult = {
  kind: 'none',
  needAppearances: false,
  fields: [],
  groups: [],
  fieldsRoot: [],
  calculationOrderRefs: [],
  tooLarge: false,
  truncated: false,
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
    /** What `documentFacts` answers; by default an unencrypted file with no title. */
    documentFacts?: (engine: EngineState) => Promise<FactsResult>
    /** What `pageAnnotations` answers; by default none. A rejection stops the engine. */
    pageAnnotations?: (index: number, engine: EngineState) => Promise<AnnotationsResult>
    /** What `formFields` answers; by default no form. A rejection stops the engine. */
    formFields?: (engine: EngineState) => Promise<FormResult>
    /** What `structureOrder` answers; by default no order. */
    structureOrder?: (index: number, engine: EngineState) => Promise<OrderResult>
    /** What `scripts` answers; by default none. A rejection stops the engine. */
    scripts?: (engine: EngineState) => Promise<ScriptsResult>
    /**
     * What `renderAnnotations` answers; by default a bitmap of the size asked with every entry
     * drawn. A rejection with `engine-failure` stops the engine.
     */
    renderAnnotations?: (
      index: number,
      options: FieldRenderOptions,
      engine: EngineState
    ) => Promise<FieldsRendered>
  } = {}
) {
  const engines: FakeEngine[] = []
  const states: EngineState[] = []
  const renders: { index: number; options: RenderOptions; engine: number }[] = []
  const fieldRenders: { index: number; options: FieldRenderOptions; engine: number }[] =
    []
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
    /** `answer` on a live engine; an `engine-failure` from it stops the engine. */
    const stopping = <T>(answer: () => T | Promise<T>): Promise<T> =>
      live()
        .then(answer)
        .catch((error: unknown) => {
          if ((opts.traps ?? true) && hasCode(error, 'engine-failure'))
            state.stopped = true
          throw error
        })
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
      documentFacts: vi.fn<ReaderEngineDocument['documentFacts']>(() =>
        stopping(() =>
          opts.documentFacts ? opts.documentFacts(state) : { encrypted: false }
        )
      ),
      pageAnnotations: vi.fn<ReaderEngineDocument['pageAnnotations']>((index) =>
        stopping(() =>
          opts.pageAnnotations
            ? opts.pageAnnotations(index, state)
            : { annotations: [], truncated: false }
        )
      ),
      formFields: vi.fn<ReaderEngineDocument['formFields']>(() =>
        stopping(() => (opts.formFields ? opts.formFields(state) : emptyForm))
      ),
      scripts: vi.fn<ReaderEngineDocument['scripts']>(() =>
        stopping(() => (opts.scripts ? opts.scripts(state) : noScripts))
      ),
      structureOrder: vi.fn<ReaderEngineDocument['structureOrder']>((index) =>
        stopping(() =>
          opts.structureOrder
            ? opts.structureOrder(index, state)
            : { order: [], truncated: false }
        )
      ),
      renderAnnotations: vi.fn<ReaderEngineDocument['renderAnnotations']>(
        (index, options) => {
          fieldRenders.push({ index, options, engine: state.index })
          return stopping(() =>
            opts.renderAnnotations
              ? opts.renderAnnotations(index, options, state)
              : {
                  width: options.size.width,
                  height: options.size.height,
                  data: new Uint8ClampedArray(4),
                  drawn: options.annotations.map((a) => a.index),
                }
          )
        }
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
  const start = createEngine as unknown as () => Promise<CoreEngine>
  const warn = vi.fn<(message: string) => void>()
  const open = () =>
    createEngineReader({
      start,
      bytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      password: undefined,
      warn,
    })
  return { engines, states, renders, fieldRenders, createEngine, start, warn, open }
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
    expectTypeOf<EngineModule.Engine>().toExtend<CoreEngine>()
  })
})

describe('opening', () => {
  it('opens the bytes in an engine of its own and reports the page count', async () => {
    const t = setup({ pageCount: 3 })
    const reader = await t.open()
    expect(reader.pageCount).toBe(3)
    expect(t.createEngine).toHaveBeenCalledTimes(1)
    expect(t.engines[0]!.open).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), {})
  })

  it('passes the password', async () => {
    const t = setup()
    await createEngineReader({
      start: t.start,
      bytes: () => Promise.resolve(new Uint8Array([1])),
      password: 'secret',
    })
    expect(t.engines[0]!.open).toHaveBeenCalledWith(new Uint8Array([1]), {
      password: 'secret',
    })
  })

  it('passes an empty password', async () => {
    const t = setup()
    await createEngineReader({
      start: t.start,
      bytes: () => Promise.resolve(new Uint8Array([1])),
      password: '',
    })
    expect(t.engines[0]!.open).toHaveBeenCalledWith(new Uint8Array([1]), { password: '' })
  })

  it('rejects with AssetLoadFailed, with the cause, when the engine cannot start', async () => {
    const noWasm = new Error('no wasm')
    const reader = createEngineReader({
      start: () => Promise.reject(noWasm),
      bytes: () => Promise.resolve(new Uint8Array()),
      password: undefined,
    })
    await expect(reader).rejects.toMatchObject({
      code: 'AssetLoadFailed',
      details: { cause: noWasm },
    })
  })

  it('passes on an InkError the start rejects with', async () => {
    const failed = new InkError('AssetLoadFailed', 'no binary', { cause: 'offline' })
    const reader = createEngineReader({
      start: () => Promise.reject(failed),
      bytes: () => Promise.resolve(new Uint8Array()),
      password: undefined,
    })
    await expect(reader).rejects.toBe(failed)
  })

  /** A reader whose engine refuses the file with `refusal`, opened with `password`. */
  const refusedWith = async (refusal: unknown, password?: string) => {
    const t = setup()
    t.createEngine.mockImplementationOnce(() => {
      const engine = {
        open: vi.fn(() => Promise.reject(refusal as Error)),
        destroy: vi.fn(() => Promise.resolve()),
      }
      t.engines.push(engine as unknown as FakeEngine)
      return Promise.resolve(engine as unknown as FakeEngine)
    })
    const error: unknown = await createEngineReader({
      start: t.start,
      bytes: () => Promise.resolve(new Uint8Array([1])),
      password,
    }).catch((e: unknown) => e)
    expect(t.engines[0]!.destroy).toHaveBeenCalledTimes(1)
    return error
  }

  it('rejects with InvalidPdf, with the engine code and message, when the engine refuses the file, and destroys it', async () => {
    const refusal = Object.assign(new Error('The file is not a valid PDF.'), {
      name: 'EngineError',
      code: 'invalid-pdf',
    })
    expect(await refusedWith(refusal)).toMatchObject({
      name: 'InkError',
      code: 'InvalidPdf',
      message: 'The file is not a valid PDF.',
      details: {
        engineCode: 'invalid-pdf',
        engineMessage: 'The file is not a valid PDF.',
      },
      cause: refusal,
    })
    // Whatever else the engine refuses the file for is a file it cannot read, as with PDF.js.
    expect(await refusedWith(engineError('unsupported-security'))).toMatchObject({
      code: 'InvalidPdf',
      details: { engineCode: 'unsupported-security' },
    })
    expect(await refusedWith(engineError('engine-failure'))).toMatchObject({
      code: 'InvalidPdf',
      details: { engineCode: 'engine-failure' },
    })
  })

  it('rejects with PasswordRequired when the engine asks for a password, and says when the one given is wrong', async () => {
    expect(await refusedWith(engineError('password-required'))).toMatchObject({
      code: 'PasswordRequired',
      details: { passwordSupplied: false, incorrect: false },
    })
    expect(await refusedWith(engineError('password-incorrect'), 'nope')).toMatchObject({
      code: 'PasswordRequired',
      details: { passwordSupplied: true, incorrect: true },
    })
    // An empty password is no password, as with PDF.js: the file still asks for one.
    expect(await refusedWith(engineError('password-incorrect'), '')).toMatchObject({
      code: 'PasswordRequired',
      details: { passwordSupplied: true, incorrect: false },
    })
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

  it('hides the annotations it has object numbers or places in /Annots for', async () => {
    const t = setup()
    const reader = await t.open()
    await reader.draw(
      request({
        hide: [
          { id: '12R', objectNumber: 12 },
          { id: 'annot_4' },
          { id: 'p0i3', index: 3 },
        ],
      }),
      fakeCanvas().canvas
    )
    expect(t.renders[0]!.options.hide).toEqual([12, { index: 3 }])
  })

  it('queues a background draw behind the calls that are not background', async () => {
    const t = setup()
    const reader = await t.open()
    await reader.draw(request({ background: true }), fakeCanvas().canvas)
    await reader.draw(request(), fakeCanvas().canvas)
    expect(t.renders[0]!.options.background).toBe(true)
    expect(t.renders[1]!.options).not.toHaveProperty('background')
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
      code: 'EngineUnavailable',
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
    expect(bad).toMatchObject({
      status: 'rejected',
      reason: { code: 'EngineUnavailable' },
    })
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

  it('rejects a page-facts read running at destroy with DocumentDestroyed', async () => {
    const t = setup({ pageCount: 2 })
    const reader = await t.open()
    const first = t.engines[0]!
    const held = deferred<void>()
    const original = first.doc.pageInfo.getMockImplementation()!
    // Page 1's facts are held until the engine is destroyed, then rejected as the engine does.
    first.doc.pageInfo.mockImplementation((index: number) =>
      index === 1
        ? held.promise.then(() => Promise.reject(engineError('aborted')))
        : original(index)
    )
    first.destroy.mockImplementation(() => {
      held.resolve()
      return Promise.resolve()
    })
    const asking = reader.pageInfo(1)
    await vi.waitFor(() => expect(first.doc.pageInfo).toHaveBeenCalledWith(1))
    await reader.destroy()
    await expect(asking).rejects.toMatchObject({ code: 'DocumentDestroyed' })
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
      code: 'EngineUnavailable',
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

  it('gives no links for a page whose links cannot be read', async () => {
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
    return { t, reader, found }
  }

  it('reads every other page of a file in which one page stops the engine, 8 at a time', async () => {
    const { t, found } = await linksAtOpen(40, (page) => page === 3)
    // Pages 0 to 2 are read before page 3 stops the engine. Only page 3 has none: the seven
    // read at the same time, queued behind it when it stopped the first engine and again on the
    // second, which its retry stopped, had the engine stop under them, and read on a third.
    expect(found).toEqual([1, 1, 1, 0, ...Array<number>(36).fill(1)])
    expect(t.createEngine).toHaveBeenCalledTimes(3)
  })

  it('stops asking for links once link reads have stopped three engines in a row', async () => {
    const { t, reader, found } = await linksAtOpen(40, () => true)
    expect(found).toEqual(Array<number>(40).fill(0))
    // The engine the file opened in and the two that replaced the first two the reads stopped.
    // The third is not replaced: once three are stopped no link read asks again, those waiting
    // to try again included.
    expect(t.createEngine).toHaveBeenCalledTimes(3)
    // Link reads' stops count towards neither stopping the reader nor blocking a page: every
    // page still draws and reads.
    expect(reader.engineStopped.get()).toBe(false)
    for (let page = 0; page < 40; page++) {
      await expect(reader.draw(request({ page }), fakeCanvas().canvas)).resolves.toBe(
        undefined
      )
      await expect(reader.tabOrder(page)).resolves.toEqual([])
    }
  })

  it('draws a page whose link read stops every engine, and reads its Tab order', async () => {
    const t = setup({
      pageCount: 2,
      pageLinks: (index) =>
        index === 1 ? Promise.reject(engineError('engine-failure')) : oneLink(),
    })
    const reader = await t.open()
    await reader.pageInfo(0)
    for (let i = 0; i < 2; i++) await expect(reader.links(1)).resolves.toEqual([])
    const { canvas, context } = fakeCanvas()
    await reader.draw(request({ page: 1 }), canvas)
    expect(context.putImageData).toHaveBeenCalledTimes(1)
    await expect(reader.tabOrder(1)).resolves.toEqual([])
    await expect(reader.text(1, { glyphs: false })).resolves.toMatchObject({ page: 1 })
    expect(reader.engineStopped.get()).toBe(false)
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
    // Eight engines stopped, none of them counted towards stopping the reader.
    expect(reader.engineStopped.get()).toBe(false)
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
      code: 'EngineUnavailable',
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
    // As for links read 8 at a time: only name 3 resolves to nothing. The seven looked up with
    // it had the engine stop under them, and are looked up again on a third.
    expect(outline.map((o) => o.target.kind)).toEqual([
      ...Array<string>(3).fill('resolved'),
      'unsupported',
      ...Array<string>(36).fill('resolved'),
    ])
    expect(t.createEngine).toHaveBeenCalledTimes(3)
  })

  it('stops looking names up once lookups have stopped three engines in a row, within one outline read', async () => {
    const { t, reader } = await namedOutline(() => true)
    const outline = await reader.outline()
    expect(outline).toHaveLength(40)
    expect(outline.every((o) => o.target.kind === 'unsupported')).toBe(true)
    // The engine the file opened in and the two that replaced the first two the lookups
    // stopped; once three are stopped no lookup asks again. Asking every name would start a new
    // engine for each batch of lookups that run at once.
    expect(t.createEngine).toHaveBeenCalledTimes(3)
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

  it('an outline that cannot be read rejects', async () => {
    const t = setup({ outline: () => Promise.reject(new Error('cannot read')) })
    const reader = await t.open()
    await expect(reader.outline()).rejects.toThrow('cannot read')
  })
})

describe('an engine that cannot start', () => {
  /**
   * A two-page file whose first engine stops on its first text read, and whose replacement
   * cannot start.
   */
  const stopsThenCannotStart = async () => {
    const t = setup({
      pageCount: 2,
      pageText: () => Promise.reject(engineError('engine-failure')),
    })
    const reader = await t.open()
    // A page the engine has read, so the reader can tell the engine stopped.
    await reader.pageInfo(0)
    const real = t.createEngine.getMockImplementation()!
    t.createEngine.mockImplementation(() => {
      if (t.createEngine.mock.calls.length > 1)
        return Promise.reject(new Error('no wasm'))
      return real()
    })
    return { t, reader }
  }

  const unavailable = { name: 'InkError', code: 'EngineUnavailable' }

  it('a text read whose engine stopped and could not be replaced rejects with EngineUnavailable', async () => {
    const { t, reader } = await stopsThenCannotStart()
    expect(reader.unavailable()).toBeUndefined()
    await expect(reader.text(1, { glyphs: true })).rejects.toMatchObject(unavailable)
    expect(reader.unavailable()).toMatchObject(unavailable)
    expect(t.createEngine).toHaveBeenCalledTimes(2)
  })

  it('then every call rejects with EngineUnavailable, kept answers included, with no engine started again', async () => {
    const { t, reader } = await stopsThenCannotStart()
    await expect(reader.text(0, { glyphs: false })).rejects.toMatchObject(unavailable)
    expect(t.createEngine).toHaveBeenCalledTimes(2)
    const { canvas } = fakeCanvas()
    for (let i = 0; i < 3; i++) {
      const calls: [string, Promise<unknown>][] = [
        ['text', reader.text(0, { glyphs: false })],
        ['textFamilies', reader.textFamilies(0)],
        ['textBaselines', reader.textBaselines(0)],
        // Page 0's facts were read before the engine stopped; page 1's never were.
        ['pageInfo 0', reader.pageInfo(0)],
        ['pageInfo 1', reader.pageInfo(1)],
        ['facts', reader.facts()],
        ['annotations', reader.annotations(1)],
        ['form', reader.form()],
        ['tabOrder', reader.tabOrder(1)],
        ['scripts', reader.scripts()],
        ['pageScripts', reader.pageScripts(1)],
        ['sandboxFields', reader.sandboxFields()],
        ['links', reader.links(1)],
        ['outline', reader.outline()],
        ['name', reader.resolveDestination(`name-${i}`)],
        ['explicit', reader.resolveDestination([1, { name: 'Fit' }])],
        ['draw', reader.draw(request({ page: 1 }), canvas)],
        ['drawFields', reader.drawFields({ ...fieldRequest, page: 1 }, canvas)],
      ]
      for (const [name, call] of calls)
        await expect(call, name).rejects.toMatchObject(unavailable)
    }
    expect(t.createEngine).toHaveBeenCalledTimes(2)
  })

  it('a call aborted, or made after destroy, rejects with its own reason', async () => {
    const { reader } = await stopsThenCannotStart()
    await reader.text(0, { glyphs: false }).catch(() => undefined)
    const reason = new Error('moved on')
    const c = new AbortController()
    c.abort(reason)
    await expect(reader.text(0, { glyphs: false, signal: c.signal })).rejects.toBe(reason)
    await reader.destroy()
    await expect(reader.text(0, { glyphs: false })).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    await expect(reader.outline()).rejects.toMatchObject({ code: 'DocumentDestroyed' })
  })

  it('a call waiting on a replacement still starting at destroy rejects with DocumentDestroyed', async () => {
    const t = setup({ pageCount: 2 })
    const reader = await t.open()
    await reader.pageInfo(0)
    const starting = deferred<never>()
    t.createEngine.mockImplementation(() => starting.promise)
    // The first engine stops, and page 1's facts wait on its replacement.
    t.states[0]!.stopped = true
    const asking = reader.pageInfo(1)
    await vi.waitFor(() => expect(t.createEngine).toHaveBeenCalledTimes(2))
    void reader.destroy()
    starting.reject(new Error('no wasm'))
    await expect(asking).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    expect(reader.unavailable()).toBeUndefined()
  })

  it('drops the text it kept', async () => {
    const t = setup({
      pageCount: 2,
      pageText: (index) =>
        index === 0
          ? Promise.resolve(hiText())
          : Promise.reject(engineError('engine-failure')),
    })
    const reader = await t.open()
    await reader.pageInfo(0)
    // Page 0 is read by the engine and kept.
    const engineText = await reader.text(0, { glyphs: false })
    expect(engineText.items.map((i) => i.str).join('')).toContain('Hi')
    t.createEngine.mockImplementation(() => Promise.reject(new Error('no wasm')))
    await expect(reader.text(1, { glyphs: false })).rejects.toMatchObject(unavailable)
    // Page 0, read again, is not given from what was kept.
    await expect(reader.text(0, { glyphs: false })).rejects.toMatchObject(unavailable)
    expect(t.engines[0]!.doc.pageText).toHaveBeenCalledTimes(2)
  })

  it('page facts still being read when the engine cannot start reject with EngineUnavailable', async () => {
    const t = setup({
      pageCount: 2,
      pageText: () => Promise.reject(engineError('engine-failure')),
    })
    const reader = await t.open()
    await reader.pageInfo(0)
    // Page 1's facts are still on their way from the first engine when it stops.
    const slow = deferred<Awaited<ReturnType<ReaderEngineDocument['pageInfo']>>>()
    t.engines[0]!.doc.pageInfo.mockImplementationOnce(() => slow.promise)
    const first = reader.pageInfo(1)
    t.createEngine.mockImplementation(() => Promise.reject(new Error('no wasm')))
    await expect(reader.text(0, { glyphs: false })).rejects.toMatchObject(unavailable)
    // The engine cannot start; page 1's read on the stopped engine has not failed yet.
    const second = reader.pageInfo(1)
    slow.reject(engineError('engine-failure'))
    await expect(first).rejects.toMatchObject(unavailable)
    await expect(second).rejects.toMatchObject(unavailable)
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

/** A widget of a text field `name` on page 0, object 20, at /Annots index `index`. */
const textField = (index: number): FormResult['fields'][number] => ({
  name: 'name',
  origin: 'acroform',
  kind: 'text',
  flags: 0,
  valueKind: 'string',
  value: 'Ann',
  defaultValueKind: 'none',
  widgets: [
    {
      page: 0,
      index,
      objectNumber: 20,
      generation: 0,
      rect: [10, 10, 50, 30],
      rectOk: true,
      flags: 4,
      hasAppearance: true,
      appearanceStates: [],
      scripts: {},
    },
  ],
})

/** Page 0's annotations: a Square (object 9) at 0 and the text field's widget (object 20) at 1. */
const squareAndWidget: AnnotationsResult = {
  annotations: [
    {
      index: 0,
      subtype: 'Square',
      objectNumber: 9,
      generation: 0,
      rect: [0, 0, 10, 10],
      rectOk: true,
      flags: 4,
      hasAppearance: true,
      appearanceStates: [],
    },
    {
      index: 1,
      subtype: 'Widget',
      objectNumber: 20,
      generation: 0,
      rect: [10, 10, 50, 30],
      rectOk: true,
      flags: 4,
      hasAppearance: true,
      appearanceStates: [],
    },
  ],
  truncated: false,
}

const formWithText = (index = 1): FormResult => ({
  ...emptyForm,
  kind: 'acroform',
  fields: [textField(index)],
})

describe("the file's facts, annotations, form and Tab order", () => {
  /** A reader over a two-page file: a Square and a text field's widget on page 0. */
  const opened = async (over: Parameters<typeof setup>[0] = {}) => {
    const t = setup({
      pageCount: 2,
      documentFacts: () =>
        Promise.resolve({
          title: 'Report',
          author: { bytes: new Uint8Array([0x41, 0x80]) },
          encrypted: true,
        }),
      pageAnnotations: (index) =>
        Promise.resolve(
          index === 0 ? squareAndWidget : { annotations: [], truncated: false }
        ),
      formFields: () => Promise.resolve(formWithText()),
      structureOrder: (index) =>
        Promise.resolve(
          index === 0
            ? { order: [20, 9], truncated: false }
            : { order: [], truncated: false }
        ),
      ...over,
    })
    const reader = await t.open()
    return { t, reader }
  }

  it('reads them from the engine while it works', async () => {
    const { t, reader } = await opened()
    // Bytes that are not text are decoded as PDF.js decodes them.
    await expect(reader.facts()).resolves.toEqual({
      title: 'Report',
      author: 'A•',
      encrypted: true,
    })
    const annotations = await reader.annotations(0)
    expect(annotations.map((a) => [a.id, a.subtype])).toEqual([
      ['9R', 'Square'],
      ['20R', 'Widget'],
    ])
    const fields = await reader.form()
    expect(fields).toMatchObject([{ name: 'name', kind: 'text', value: 'Ann' }])
    expect(fields[0]!.widgets[0]).toMatchObject({ id: '20R', page: 0, at: 1 })
    await expect(reader.tabOrder(0)).resolves.toEqual(['20R', '9R'])
    await expect(reader.tabOrder(1)).resolves.toEqual([])
    // The form is read once for both the widget's annotation and the fields.
    expect(t.engines[0]!.doc.formFields).toHaveBeenCalledTimes(1)
    await reader.destroy()
    await expect(reader.facts()).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await expect(reader.annotations(0)).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    await expect(reader.form()).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await expect(reader.tabOrder(0)).rejects.toMatchObject({ code: 'DocumentDestroyed' })
  })

  it('gives a page that is not in the file PageOutOfRange', async () => {
    const { reader } = await opened()
    await expect(reader.annotations(2)).rejects.toMatchObject({ code: 'PageOutOfRange' })
    await expect(reader.tabOrder(-1)).rejects.toMatchObject({ code: 'PageOutOfRange' })
    await reader.destroy()
  })

  it('gives a form refused for its size no fields', async () => {
    const { reader } = await opened({
      formFields: () =>
        Promise.resolve({ ...formWithText(), fields: [], tooLarge: true }),
    })
    await expect(reader.form()).resolves.toEqual([])
    await reader.destroy()
  })

  it('reads again on a new engine once the engine stops under a read', async () => {
    let calls = 0
    const { t, reader } = await opened({
      // The first engine stops on its first annotations read.
      pageAnnotations: (_, engine) =>
        engine.index === 0 && calls++ === 0
          ? Promise.reject(engineError('engine-failure'))
          : Promise.resolve(squareAndWidget),
    })
    await reader.pageInfo(0)
    await expect(reader.annotations(0)).resolves.toHaveLength(2)
    expect(t.createEngine).toHaveBeenCalledTimes(2)
    await reader.destroy()
  })

  it('a page whose annotations or order a working engine cannot read has none', async () => {
    const { reader } = await opened({
      traps: false,
      pageAnnotations: () => Promise.reject(engineError('engine-failure')),
      structureOrder: () => Promise.reject(engineError('engine-failure')),
    })
    await reader.pageInfo(0)
    await expect(reader.annotations(0)).resolves.toEqual([])
    await expect(reader.tabOrder(0)).resolves.toEqual([])
    await reader.destroy()
  })

  it("gives a page's annotations, and no fields, when a working engine cannot read the form", async () => {
    const { reader } = await opened({
      traps: false,
      formFields: () => Promise.reject(engineError('engine-failure')),
    })
    await reader.pageInfo(0)
    await expect(reader.annotations(0)).resolves.toHaveLength(2)
    await expect(reader.form()).resolves.toEqual([])
    await reader.destroy()
  })

  it('leaves out the widgets of a page whose annotations a working engine cannot read', async () => {
    const { reader } = await opened({
      traps: false,
      pageAnnotations: () => Promise.reject(engineError('engine-failure')),
    })
    await reader.pageInfo(0)
    await expect(reader.form()).resolves.toEqual([])
    await expect(reader.annotations(0)).resolves.toEqual([])
    await reader.destroy()
  })

  it("gives no title or author when a working engine cannot read the file's facts, and the last encrypted", async () => {
    let fail = false
    const { reader } = await opened({
      traps: false,
      documentFacts: () =>
        fail
          ? Promise.reject(engineError('engine-failure'))
          : Promise.resolve({ title: 'Report', encrypted: true }),
    })
    await reader.pageInfo(0)
    await expect(reader.facts()).resolves.toEqual({ title: 'Report', encrypted: true })
    fail = true
    await expect(reader.facts()).resolves.toEqual({ encrypted: true })
    await reader.destroy()
    const never = await opened({
      traps: false,
      documentFacts: () => Promise.reject(engineError('engine-failure')),
    })
    await never.reader.pageInfo(0)
    await expect(never.reader.facts()).resolves.toEqual({ encrypted: false })
    await never.reader.destroy()
  })

  it("answers the file's facts asked first, before any page, when a working engine cannot read them", async () => {
    const { t, reader } = await opened({
      traps: false,
      documentFacts: () => Promise.reject(engineError('engine-failure')),
    })
    await expect(reader.facts()).resolves.toEqual({ encrypted: false })
    expect(t.createEngine).toHaveBeenCalledTimes(1)
    await reader.destroy()
  })

  it('rejects the form when a page read inside it finds no engine to answer', async () => {
    const { reader } = await opened({
      pageAnnotations: () => Promise.reject(engineError('engine-failure')),
    })
    await reader.pageInfo(0)
    await expect(reader.form()).rejects.toMatchObject({ code: 'EngineUnavailable' })
    await reader.destroy()
  })

  it("shares each page's annotations read with the form until forgetAnnotations", async () => {
    const { t, reader } = await opened()
    const first = await reader.annotations(0)
    // Each caller gets its own.
    first[0]!.rect[0] = 99
    await reader.form()
    await expect(reader.annotations(0)).resolves.toMatchObject([
      { rect: [0, 0, 10, 10] },
      {},
    ])
    expect(t.engines[0]!.doc.pageAnnotations).toHaveBeenCalledTimes(1)
    reader.forgetAnnotations()
    await reader.annotations(0)
    expect(t.engines[0]!.doc.pageAnnotations).toHaveBeenCalledTimes(2)
    await reader.destroy()
  })

  it('rejects when no engine can answer, rather than giving nothing', async () => {
    const { reader } = await opened({
      documentFacts: () => Promise.reject(engineError('engine-failure')),
      formFields: () => Promise.reject(engineError('engine-failure')),
      pageAnnotations: () => Promise.reject(engineError('engine-failure')),
    })
    await reader.pageInfo(0)
    // Each engine stops on the read and so does the one that replaces it.
    await expect(reader.facts()).rejects.toMatchObject({ code: 'EngineUnavailable' })
    await expect(reader.form()).rejects.toMatchObject({ code: 'EngineUnavailable' })
    await expect(reader.annotations(0)).rejects.toMatchObject({
      code: 'EngineUnavailable',
    })
    await reader.destroy()
  })

  it("reads the file's scripts, its pages' actions and the sandbox's fields from the engine, once", async () => {
    const field = textField(1)
    const { t, reader } = await opened({
      formFields: () =>
        Promise.resolve({
          ...formWithText(),
          fields: [
            {
              ...field,
              objectNumber: 20,
              generation: 0,
              widgets: [{ ...field.widgets[0]!, scripts: { K: ['event.rc = true'] } }],
            },
          ],
          fieldsRoot: [
            {
              ref: { objectNumber: 20, generation: 0 },
              dictionary: true,
              hasKids: false,
              partialName: 'name',
            },
          ],
        }),
      scripts: () =>
        Promise.resolve({
          document: [{ name: 'init', source: 'var ready = true' }],
          documentActions: {},
          pageActions: [{ page: 1, scripts: { O: ['var opened = true'] } }],
          truncated: false,
        }),
    })
    const read = await reader.scripts()
    expect(read).toStrictEqual({
      calculationOrder: [],
      calculationOrderIds: [],
      document: [{ name: 'init', source: 'var ready = true' }],
      documentActions: {},
      fields: [{ name: 'name', widgets: ['20R'] }],
    })
    // Each caller gets its own.
    read!.document.length = 0
    await expect(reader.scripts()).resolves.toMatchObject({
      document: [{ name: 'init' }],
    })
    await expect(reader.pageScripts(1)).resolves.toStrictEqual({
      PageOpen: ['var opened = true'],
    })
    await expect(reader.pageScripts(0)).resolves.toStrictEqual({})
    await expect(reader.pageScripts(2)).rejects.toMatchObject({ code: 'PageOutOfRange' })
    const objects = await reader.sandboxFields()
    expect([...(objects?.keys() ?? [])]).toEqual(['name'])
    expect(objects?.get('name')).toMatchObject([
      {
        id: '20R',
        type: 'text',
        value: 'Ann',
        actions: { Keystroke: ['event.rc = true'] },
      },
    ])
    expect(t.engines[0]!.doc.scripts).toHaveBeenCalledTimes(1)
    await reader.destroy()
    await expect(reader.scripts()).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await expect(reader.pageScripts(0)).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    await expect(reader.sandboxFields()).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
  })

  it("keeps nothing the sandbox's fields read after forgetAnnotations, and shares one read of the scripts and form with them", async () => {
    const field = textField(1)
    const { t, reader } = await opened({
      formFields: () =>
        Promise.resolve({
          ...formWithText(),
          fields: [
            {
              ...field,
              objectNumber: 20,
              generation: 0,
              widgets: [{ ...field.widgets[0]!, scripts: { K: ['event.rc = true'] } }],
            },
          ],
          fieldsRoot: [
            {
              ref: { objectNumber: 20, generation: 0 },
              dictionary: true,
              hasKids: false,
              partialName: 'name',
            },
          ],
        }),
      scripts: () =>
        Promise.resolve({
          document: [{ name: 'init', source: 'var ready = true' }],
          documentActions: {},
          pageActions: [],
          truncated: false,
        }),
    })
    const doc = t.engines[0]!.doc
    // As the open reads them, then lets them go.
    await reader.annotations(0)
    await reader.annotations(1)
    await reader.form()
    reader.forgetAnnotations()
    expect(doc.pageAnnotations).toHaveBeenCalledTimes(2)
    expect(doc.formFields).toHaveBeenCalledTimes(1)
    // As the scripts start: the form is read once for both, the scripts once.
    await expect(reader.scripts()).resolves.toMatchObject({ fields: [{ name: 'name' }] })
    await expect(reader.sandboxFields()).resolves.toBeInstanceOf(Map)
    expect(doc.scripts).toHaveBeenCalledTimes(1)
    expect(doc.formFields).toHaveBeenCalledTimes(2)
    expect(doc.pageAnnotations).toHaveBeenCalledTimes(3)
    expect(doc.pageAnnotations).toHaveBeenLastCalledWith(0)
    // The sandbox's page read is not kept: a later read asks the engine again.
    await reader.annotations(0)
    expect(doc.pageAnnotations).toHaveBeenCalledTimes(4)
    // Nor are the form and scripts read for it, once the open lets them go.
    reader.forgetAnnotations()
    await reader.sandboxFields()
    expect(doc.formFields).toHaveBeenCalledTimes(3)
    expect(doc.pageAnnotations).toHaveBeenCalledTimes(5)
    // The scripts' own facts are kept: the pages' actions read them.
    expect(doc.scripts).toHaveBeenCalledTimes(1)
    await reader.destroy()
  })

  it('reads a file whose scripts a working engine cannot read as having none', async () => {
    const { reader } = await opened({
      scripts: () => Promise.reject(engineError('bad-argument')),
    })
    await reader.pageInfo(0)
    await expect(reader.scripts()).resolves.toBeUndefined()
    await expect(reader.pageScripts(1)).resolves.toStrictEqual({})
    await expect(reader.sandboxFields()).resolves.toBeNull()
    await reader.destroy()
  })

  it('rejects the scripts when no engine can answer', async () => {
    const { reader } = await opened({
      scripts: () => Promise.reject(engineError('engine-failure')),
    })
    await reader.pageInfo(0)
    await expect(reader.scripts()).rejects.toMatchObject({ code: 'EngineUnavailable' })
    await expect(reader.pageScripts(0)).rejects.toMatchObject({
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

describe('field appearances', () => {
  /** A checkbox's widget, object 21, off, at /Annots place 1. */
  const box: AnnotationsResult['annotations'][number] = {
    index: 1,
    subtype: 'Widget',
    objectNumber: 21,
    generation: 0,
    rect: [100, 100, 120, 120],
    rectOk: true,
    flags: 4,
    hasAppearance: true,
    appearanceStates: ['Off', 'Yes'],
    appearanceState: 'Off',
  }
  /**
   * Page 0: the Square (object 9) at 0, the checkbox at 1 and the text field's widget (object
   * 20) at 2.
   */
  const page: AnnotationsResult = {
    annotations: [
      squareAndWidget.annotations[0]!,
      box,
      { ...squareAndWidget.annotations[1]!, index: 2 },
    ],
    truncated: false,
  }
  const form: FormResult = {
    ...formWithText(2),
    fields: [
      textField(2),
      {
        name: 'agree',
        origin: 'acroform',
        kind: 'checkbox',
        flags: 0,
        valueKind: 'name',
        value: 'Off',
        defaultValueKind: 'none',
        widgets: [{ ...box, page: 0, onState: 'Yes', scripts: {} }],
      },
    ],
  }
  const opened = async (over: Parameters<typeof setup>[0] = {}) => {
    const t = setup({
      pageAnnotations: () => Promise.resolve(page),
      formFields: () => Promise.resolve(form),
      ...over,
    })
    return { t, reader: await t.open() }
  }
  /** A pass at zoom 2 whose 300 × 150 canvas sits at device pixel (200, 1300). */
  const pass = (over: Partial<FieldDrawRequest> = {}): FieldDrawRequest => ({
    page: 0,
    look: 'own',
    ids: new Set(['20R', '21R', '9R']),
    zoom: 2,
    rotation: 0,
    pixelRatio: 1,
    x: 200,
    y: 1300,
    ...over,
  })

  it('draws a pass in one engine call over the part of the page its canvas shows', async () => {
    const { t, reader } = await opened()
    await reader.annotations(0)
    const { canvas, context } = fakeCanvas()
    await expect(reader.drawFields(pass(), canvas)).resolves.toEqual(
      new Set(['20R', '21R'])
    )
    expect(t.fieldRenders).toHaveLength(1)
    // The Square is no field; the widgets go in /Annots order.
    expect(t.fieldRenders[0]!.options).toMatchObject({
      annotations: [{ index: 1 }, { index: 2 }],
      // Device pixels 200 to 500 across and 1300 to 1450 down, at 2 a point.
      region: { x: 100, y: 67, width: 150, height: 75 },
      size: { width: 300, height: 150 },
      rotation: 0,
    })
    expect(context.putImageData).toHaveBeenCalledTimes(1)
    // The page's annotations are read once, for the list and for the draw.
    expect(t.engines[0]!.doc.pageAnnotations).toHaveBeenCalledTimes(1)
    await reader.destroy()
  })

  it('draws a toggle’s on-state for checked and Off for unchecked, and nothing of other fields', async () => {
    const { t, reader } = await opened()
    await reader.drawFields(pass({ look: 'checked' }), fakeCanvas().canvas)
    await reader.drawFields(pass({ look: 'unchecked' }), fakeCanvas().canvas)
    expect(t.fieldRenders.map((r) => r.options.annotations)).toEqual([
      [{ index: 1, state: 'Yes' }],
      [{ index: 1, state: 'Off' }],
    ])
    await reader.destroy()
  })

  it('resolves with the ids the engine drew', async () => {
    const { reader } = await opened({
      renderAnnotations: (_, options) =>
        Promise.resolve({
          width: options.size.width,
          height: options.size.height,
          data: new Uint8ClampedArray(4),
          drawn: [2],
        }),
    })
    await expect(reader.drawFields(pass(), fakeCanvas().canvas)).resolves.toEqual(
      new Set(['20R'])
    )
    await reader.destroy()
  })

  it('asks nothing of the engine, and leaves the canvas, for a pass with nothing to draw', async () => {
    const { t, reader } = await opened()
    const { canvas, raw, context } = fakeCanvas()
    await expect(
      reader.drawFields(pass({ ids: new Set(['9R']) }), canvas)
    ).resolves.toEqual(new Set())
    expect(t.fieldRenders).toHaveLength(0)
    expect(context.putImageData).not.toHaveBeenCalled()
    expect([raw.width, raw.height]).toEqual([300, 150])
    await reader.destroy()
  })

  /** An engine draw that waits until its signal aborts, then rejects as the engine does. */
  const waitsForAbort = (_: number, options: FieldRenderOptions) =>
    new Promise<FieldsRendered>((_resolve, reject) =>
      options.signal?.addEventListener('abort', () => reject(engineError('aborted')), {
        once: true,
      })
    )

  it('rejects with the signal’s reason once it aborts mid-draw, the canvas untouched', async () => {
    const { t, reader } = await opened({ renderAnnotations: waitsForAbort })
    const { canvas, raw, context } = fakeCanvas()
    const controller = new AbortController()
    const reason = new Error('moved on')
    const drawing = reader.drawFields(pass(), canvas, controller.signal)
    await vi.waitFor(() => expect(t.fieldRenders).toHaveLength(1))
    controller.abort(reason)
    await expect(drawing).rejects.toBe(reason)
    expect(t.fieldRenders[0]!.options.signal?.aborted).toBe(true)
    expect(context.putImageData).not.toHaveBeenCalled()
    expect([raw.width, raw.height]).toEqual([300, 150])
    await reader.destroy()
  })

  it('rejects with DocumentDestroyed once destroyed mid-draw, the canvas untouched', async () => {
    const { t, reader } = await opened({ renderAnnotations: waitsForAbort })
    const { canvas, context } = fakeCanvas()
    const drawing = reader.drawFields(pass(), canvas)
    await vi.waitFor(() => expect(t.fieldRenders).toHaveLength(1))
    await reader.destroy()
    await expect(drawing).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    expect(context.putImageData).not.toHaveBeenCalled()
    await expect(reader.drawFields(pass(), canvas)).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
  })

  it('draws again on a new engine once the engine stops under the draw, and blocks the page when it stops one again', async () => {
    let stops = 1
    const { t, reader } = await opened({
      renderAnnotations: (_, options) =>
        stops-- > 0
          ? Promise.reject(engineError('engine-failure'))
          : Promise.resolve({
              width: options.size.width,
              height: options.size.height,
              data: new Uint8ClampedArray(4),
              drawn: [1],
            }),
    })
    await expect(reader.drawFields(pass(), fakeCanvas().canvas)).resolves.toEqual(
      new Set(['21R'])
    )
    expect(t.fieldRenders.map((r) => r.engine)).toEqual([0, 1])
    stops = 2
    // The page's second stop: the draw rejects at once, and so does every later one.
    const blocked = reader.drawFields(pass(), fakeCanvas().canvas)
    await expect(blocked).rejects.toMatchObject({
      code: 'EngineUnavailable',
      details: { page: 0 },
    })
    expect(t.createEngine).toHaveBeenCalledTimes(2)
    await expect(reader.drawFields(pass(), fakeCanvas().canvas)).rejects.toBe(
      await blocked.catch((e: unknown) => e)
    )
    expect(t.fieldRenders).toHaveLength(3)
    await reader.destroy()
  })
})

describe('lending its engine', () => {
  it('lends the engine the file is open in, and the one that replaced it once it stopped', async () => {
    const { open, engines, states } = setup()
    const reader = await open()
    await reader.pageInfo(0)
    const lent = await reader.borrowEngine()
    expect(lent.engine).toBe(engines[0])
    // A write on the lent engine stopped it: the reader finds out at once and drops it.
    states[0]!.stopped = true
    await lent.stopped()
    expect(engines[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(engines[0]!.doc.close).toHaveBeenCalledTimes(1)
    // The next loan, and the next read, start the engine that replaces it.
    expect((await reader.borrowEngine()).engine).toBe(engines[1])
    await expect(reader.text(0, { glyphs: false })).resolves.toMatchObject({ page: 0 })
    expect(engines).toHaveLength(2)
    expect(engines[1]!.open).toHaveBeenCalledTimes(1)
  })

  it('keeps an engine that still works when told a write failed in it', async () => {
    const { open, engines } = setup()
    const reader = await open()
    await reader.pageInfo(0)
    const lent = await reader.borrowEngine()
    await lent.stopped()
    expect(engines[0]!.destroy).not.toHaveBeenCalled()
    expect((await reader.borrowEngine()).engine).toBe(engines[0])
    expect(engines).toHaveLength(1)
  })

  it('rejects with EngineUnavailable when no engine can start, and once destroyed', async () => {
    const { open, states, createEngine } = setup()
    const reader = await open()
    await reader.pageInfo(0)
    const lent = await reader.borrowEngine()
    states[0]!.stopped = true
    await lent.stopped()
    createEngine.mockRejectedValueOnce(new Error('no engine'))
    await expect(reader.borrowEngine()).rejects.toMatchObject({
      code: 'EngineUnavailable',
    })
    expect(reader.unavailable()).toMatchObject({ code: 'EngineUnavailable' })
    await expect(reader.borrowEngine()).rejects.toMatchObject({
      code: 'EngineUnavailable',
    })
    void reader.destroy()
    await expect(reader.borrowEngine()).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
  })
})

describe('the stopped state', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const unavailable = { name: 'InkError', code: 'EngineUnavailable' }

  /** Every call made on every engine's document so far. */
  const engineCalls = (engines: FakeEngine[]): number =>
    engines.reduce(
      (n, e) =>
        n +
        Object.values(e.doc).reduce(
          (m: number, f) => m + (vi.isMockFunction(f) ? f.mock.calls.length : 0),
          0
        ),
      0
    )

  /**
   * A file whose text read of a page in `always` stops every engine it is read on, and of a
   * page in `once` stops the first engine it is read on.
   */
  const stopping = async (
    pageCount: number,
    stops: { always?: number[]; once?: number[] }
  ) => {
    const done = new Set<number>()
    const t = setup({
      pageCount,
      pageText: (index) => {
        if (stops.always?.includes(index))
          return Promise.reject(engineError('engine-failure'))
        if (stops.once?.includes(index) && !done.has(index)) {
          done.add(index)
          return Promise.reject(engineError('engine-failure'))
        }
        return Promise.resolve(hiText())
      },
    })
    const reader = await t.open()
    // A page the engine has read, so the reader can tell the engine stopped.
    await reader.pageInfo(0)
    return { t, reader }
  }
  const read = (reader: Awaited<ReturnType<typeof stopping>>['reader'], page: number) =>
    reader.text(page, { glyphs: false })

  it('stops the document at the third restart within 60 seconds', async () => {
    const { t, reader } = await stopping(4, { once: [1, 2, 3] })
    const seen: boolean[] = []
    reader.engineStopped.subscribe((stopped) => seen.push(stopped))
    await expect(read(reader, 1)).resolves.toMatchObject({ page: 1 })
    vi.setSystemTime(30_000)
    await expect(read(reader, 2)).resolves.toMatchObject({ page: 2 })
    expect(reader.engineStopped.get()).toBe(false)
    vi.setSystemTime(59_999)
    await expect(read(reader, 3)).rejects.toMatchObject(unavailable)
    expect(reader.engineStopped.get()).toBe(true)
    expect(seen).toEqual([true])
    expect(reader.unavailable()).toMatchObject(unavailable)
    // The third stopped engine is not replaced, and no read starts another.
    expect(t.createEngine).toHaveBeenCalledTimes(3)
    await expect(read(reader, 0)).rejects.toMatchObject(unavailable)
    await expect(reader.pageInfo(1)).rejects.toMatchObject(unavailable)
    await expect(reader.borrowEngine()).rejects.toMatchObject(unavailable)
    expect(t.createEngine).toHaveBeenCalledTimes(3)
    expect(t.engines.every((e) => e.destroy.mock.calls.length === 1)).toBe(true)
  })

  it('goes on when the third restart comes 60 seconds after the first', async () => {
    const { t, reader } = await stopping(4, { once: [1, 2, 3] })
    await read(reader, 1)
    vi.setSystemTime(30_000)
    await read(reader, 2)
    vi.setSystemTime(60_000)
    await expect(read(reader, 3)).resolves.toMatchObject({ page: 3 })
    expect(reader.engineStopped.get()).toBe(false)
    expect(t.createEngine).toHaveBeenCalledTimes(4)
  })

  it('stops the document when an engine started to replace a stopped one cannot start', async () => {
    const { t, reader } = await stopping(2, { once: [1] })
    t.createEngine.mockRejectedValue(new Error('no wasm'))
    await expect(read(reader, 1)).rejects.toMatchObject(unavailable)
    expect(reader.engineStopped.get()).toBe(true)
  })

  it('blocks a page whose reads stopped the engine twice; the other pages read on', async () => {
    const { t, reader } = await stopping(5, { always: [3] })
    const first = read(reader, 3)
    await expect(first).rejects.toMatchObject({ ...unavailable, details: { page: 3 } })
    const error = await first.catch((e: unknown) => e)
    expect(t.createEngine).toHaveBeenCalledTimes(2)
    await expect(read(reader, 4)).resolves.toMatchObject({ page: 4 })
    expect(reader.engineStopped.get()).toBe(false)
    expect(reader.unavailable()).toBeUndefined()
    // No read of page 3 reaches an engine again: each rejects with the error the second stop gave.
    const calls = engineCalls(t.engines)
    const { canvas } = fakeCanvas()
    const reads: [string, Promise<unknown>][] = [
      ['draw', reader.draw(request({ page: 3 }), canvas)],
      ['drawFields', reader.drawFields({ ...fieldRequest, page: 3 }, canvas)],
      ['text', read(reader, 3)],
      ['textFamilies', reader.textFamilies(3)],
      ['textBaselines', reader.textBaselines(3)],
      ['annotations', reader.annotations(3)],
      ['tabOrder', reader.tabOrder(3)],
      ['pageScripts', reader.pageScripts(3)],
      ['pageInfo', reader.pageInfo(3)],
    ]
    for (const [name, call] of reads) await expect(call, name).rejects.toBe(error)
    // A page whose links cannot be read has none, as ever.
    await expect(reader.links(3)).resolves.toEqual([])
    expect(engineCalls(t.engines)).toBe(calls)
    expect(t.createEngine).toHaveBeenCalledTimes(3)
    await expect(read(reader, 4)).resolves.toMatchObject({ page: 4 })
  })

  /**
   * A file whose pages in `bad` stop every engine they are drawn on, drawn through one queue on
   * each engine as the engine's own: calls wait their turn, and every call still waiting fails
   * once the engine stops.
   */
  const queued = async (pageCount: number, bad: number[]) => {
    const queue = oneQueue(
      ({ index }: { index: number; options: RenderOptions }) => bad.includes(index),
      ({ options }) => Promise.resolve(bitmap(options))
    )
    const t = setup({
      pageCount,
      render: (_, index, options, engine) => queue({ index, options }, engine),
    })
    const reader = await t.open()
    await reader.pageInfo(0)
    const canvases = Array.from({ length: pageCount }, () => fakeCanvas())
    const drawn = await Promise.allSettled(
      canvases.map((c, page) => reader.draw(request({ page }), c.canvas))
    )
    return { t, reader, canvases, drawn }
  }

  it('blocks a page that stops the engine twice, and draws the pages queued beside it', async () => {
    const { t, reader, canvases, drawn } = await queued(5, [2])
    expect(drawn[2]).toMatchObject({
      status: 'rejected',
      reason: { ...unavailable, details: { page: 2 } },
    })
    for (const page of [0, 1, 3, 4]) {
      expect(drawn[page], `page ${page}`).toEqual({
        status: 'fulfilled',
        value: undefined,
      })
      expect(canvases[page]!.context.putImageData).toHaveBeenCalledTimes(1)
    }
    // The engine the file opened in, the one page 2's retry stopped, and one for its neighbours.
    expect(t.createEngine).toHaveBeenCalledTimes(3)
    expect(reader.engineStopped.get()).toBe(false)
  })

  it('blocks each of two such pages in turn, and the rest still draw', async () => {
    const { t, reader, drawn } = await queued(6, [1, 3])
    expect(drawn.map((d) => d.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
      'rejected',
      'fulfilled',
      'fulfilled',
    ])
    // Each bad page stopped two engines; the calls queued behind them stopped none.
    expect(t.createEngine).toHaveBeenCalledTimes(5)
    expect(reader.engineStopped.get()).toBe(false)
  })

  it('takes a write the borrower reports, not a draw queued behind it, for what stopped the engine', async () => {
    let gate = deferred<void>()
    const t = setup({
      pageCount: 2,
      // A draw of page 1 waits behind the write; it then finds the engine as the write left it.
      render: async (_, index, options, engine) => {
        if (index === 1) await gate.promise
        if (engine.stopped) throw engineError('engine-failure')
        return bitmap(options)
      },
    })
    const reader = await t.open()
    await reader.pageInfo(0)
    // Twice: were the draw taken for the stops, page 1 would be blocked by the second.
    for (let i = 0; i < 2; i++) {
      gate = deferred<void>()
      const lent = await reader.borrowEngine()
      const drawing = reader.draw(request({ page: 1 }), fakeCanvas().canvas)
      await vi.waitFor(() =>
        expect(t.renders.filter((r) => r.engine === i)).toHaveLength(1)
      )
      t.states[i]!.stopped = true
      const told = lent.stopped()
      gate.resolve()
      await told
      await expect(drawing).resolves.toBeUndefined()
    }
    expect(t.createEngine).toHaveBeenCalledTimes(3)
    expect(reader.engineStopped.get()).toBe(false)
  })

  it("counts a page's first stop but not the stop that blocks it", async () => {
    const { reader } = await stopping(5, { always: [3], once: [1, 2] })
    await expect(read(reader, 3)).rejects.toMatchObject(unavailable)
    // Page 3 counted once: one more stop leaves the document reading.
    await expect(read(reader, 1)).resolves.toMatchObject({ page: 1 })
    expect(reader.engineStopped.get()).toBe(false)
    await expect(read(reader, 2)).rejects.toMatchObject(unavailable)
    expect(reader.engineStopped.get()).toBe(true)
  })

  it('counts a stop a borrower found, which names no page', async () => {
    const { t, reader } = await stopping(2, {})
    for (let i = 0; i < 3; i++) {
      const lent = await reader.borrowEngine()
      t.states[i]!.stopped = true
      await lent.stopped()
    }
    expect(reader.engineStopped.get()).toBe(true)
    expect(t.createEngine).toHaveBeenCalledTimes(3)
  })

  describe('restarting it', () => {
    /** A reader stopped because the engine to replace a stopped one could not start. */
    const stoppedReader = async () => {
      const s = await stopping(5, { always: [3], once: [1] })
      const real = s.t.createEngine.getMockImplementation()!
      // Page 3 is blocked first, then page 1's stop finds no engine to start.
      await read(s.reader, 3).catch(() => undefined)
      s.t.createEngine.mockRejectedValueOnce(new Error('no wasm'))
      await expect(read(s.reader, 1)).rejects.toMatchObject(unavailable)
      expect(s.reader.engineStopped.get()).toBe(true)
      return { ...s, real }
    }

    it('starts an engine, reopens the file, and reads again with every page unblocked', async () => {
      const { t, reader } = await stoppedReader()
      const engines = t.createEngine.mock.calls.length
      await expect(reader.restart()).resolves.toBeUndefined()
      expect(t.createEngine).toHaveBeenCalledTimes(engines + 1)
      const engine = t.engines.at(-1)!
      expect(engine.open).toHaveBeenCalledTimes(1)
      expect(engine.open.mock.calls[0]![0]).toEqual(new Uint8Array([1, 2, 3]))
      expect(reader.engineStopped.get()).toBe(false)
      expect(reader.unavailable()).toBeUndefined()
      await expect(read(reader, 1)).resolves.toMatchObject({ page: 1 })
      // Page 3 is read again: it reaches the engine, which it stops.
      const calls = engineCalls(t.engines)
      await expect(read(reader, 3)).rejects.toMatchObject(unavailable)
      expect(engineCalls(t.engines)).toBeGreaterThan(calls)
    })

    it('rejects with EngineUnavailable, and stays stopped, when no engine starts', async () => {
      const { t, reader } = await stoppedReader()
      t.createEngine.mockRejectedValueOnce(new Error('still no wasm'))
      await expect(reader.restart()).rejects.toMatchObject(unavailable)
      expect(reader.engineStopped.get()).toBe(true)
      await expect(read(reader, 0)).rejects.toMatchObject(unavailable)
      // Asked again, it tries again.
      await expect(reader.restart()).resolves.toBeUndefined()
      await expect(read(reader, 0)).resolves.toMatchObject({ page: 0 })
    })

    it('rejects, and destroys the engine it started, when that engine cannot read', async () => {
      const { t, reader, real } = await stoppedReader()
      t.createEngine.mockImplementationOnce(async () => {
        const engine = await real()
        engine.doc.pageInfo.mockRejectedValue(engineError('engine-failure'))
        return engine
      })
      await expect(reader.restart()).rejects.toMatchObject(unavailable)
      expect(t.engines.at(-1)!.destroy).toHaveBeenCalledTimes(1)
      expect(reader.engineStopped.get()).toBe(true)
    })

    it('turns engineStopped true once for each stop, however many reads it rejects', async () => {
      const { t, reader } = await stoppedReader()
      const seen: boolean[] = []
      reader.engineStopped.subscribe((stopped) => seen.push(stopped))
      for (let page = 0; page < 3; page++)
        await expect(read(reader, page)).rejects.toMatchObject(unavailable)
      await reader.restart()
      // Stopped again: the engine stops, and its replacement cannot start.
      t.states.at(-1)!.stopped = true
      t.createEngine.mockRejectedValueOnce(new Error('no wasm'))
      for (let page = 0; page < 3; page++)
        await expect(read(reader, page)).rejects.toMatchObject(unavailable)
      expect(seen).toEqual([false, true])
    })

    it('makes one engine for two calls at once', async () => {
      const { t, reader } = await stoppedReader()
      const engines = t.createEngine.mock.calls.length
      const a = reader.restart()
      const b = reader.restart()
      await Promise.all([a, b])
      expect(t.createEngine).toHaveBeenCalledTimes(engines + 1)
    })

    it('does nothing for a reader that is not stopped', async () => {
      const { t, reader } = await stopping(2, {})
      await expect(reader.restart()).resolves.toBeUndefined()
      expect(t.createEngine).toHaveBeenCalledTimes(1)
      expect(t.engines[0]!.destroy).not.toHaveBeenCalled()
    })

    it('rejects a read made while it runs, and answers the reads after it', async () => {
      const { t, reader, real } = await stoppedReader()
      const starting = deferred<void>()
      t.createEngine.mockImplementationOnce(async () => {
        await starting.promise
        return real()
      })
      const restarting = reader.restart()
      await expect(read(reader, 0)).rejects.toMatchObject(unavailable)
      starting.resolve()
      await restarting
      await expect(read(reader, 0)).resolves.toMatchObject({ page: 0 })
    })

    it('rejects with DocumentDestroyed when the reader is destroyed under it, and destroys its engine', async () => {
      const { t, reader, real } = await stoppedReader()
      const starting = deferred<void>()
      t.createEngine.mockImplementationOnce(async () => {
        await starting.promise
        return real()
      })
      const restarting = reader.restart()
      const destroying = reader.destroy()
      starting.resolve()
      await expect(restarting).rejects.toMatchObject({ code: 'DocumentDestroyed' })
      await destroying
      await vi.waitFor(() => expect(t.engines.at(-1)!.destroy).toHaveBeenCalledTimes(1))
      expect(t.engines.every((e) => e.destroy.mock.calls.length === 1)).toBe(true)
      await expect(reader.restart()).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    })
  })
})

describe('a region with no area', () => {
  it('draws a 1 × 1 transparent canvas without asking the engine', async () => {
    const t = setup()
    const reader = await t.open()
    const { canvas, raw, context } = fakeCanvas()
    await reader.draw(
      request({ width: 10, height: 10, region: { x: 72, y: 72, width: 0, height: 20 } }),
      canvas
    )
    expect([raw.width, raw.height]).toEqual([1, 1])
    expect(context.putImageData).not.toHaveBeenCalled()
    expect(t.renders).toHaveLength(0)
  })
})

describe('a link stored as a direct object', () => {
  it('has the id its annotation has', async () => {
    const entry = {
      index: 8,
      subtype: 'Link',
      flags: 4,
      rectOk: true,
      hasQuads: false,
      quadsOk: true,
    }
    const t = setup({
      pageLinks: () =>
        Promise.resolve({
          annotations: [entry],
          links: [{ index: 8, rect: { x: 72, y: 700, width: 100, height: 20 } }],
        }),
      pageAnnotations: () =>
        Promise.resolve({
          annotations: [
            {
              ...entry,
              rect: [72, 700, 172, 720],
              hasAppearance: false,
              appearanceStates: [],
            },
          ],
          truncated: false,
        }),
    })
    const reader = await t.open()
    const [annotation] = await reader.annotations(0)
    expect(annotation!.id).toBe('p0i8')
    const [link] = await reader.links(0)
    expect(link!.id).toBe(`pdf:0:${annotation!.id}`)
  })
})
