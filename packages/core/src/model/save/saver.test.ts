import { EngineError } from '@inkbar/engine'
import { describe, expect, it, vi } from 'vitest'

import { UnpaintableError } from '../annotations/drawing/pdf/paint'

import { createSaver, type EngineLoader } from './saver'
import { AnnotationUnwritable } from './write-input'

import type { Engine, EngineDocument, WriteInput } from '@inkbar/engine'

/**
 * A stand-in engine that records its calls. Like the real one, its calls run one at a time in
 * the order they were made, and each write starts from the file as opened: a save gives the
 * number of annotations the last write held, 0 after a failed one. `failNext` makes the next
 * write reject with that error; `hold` holds the next write until `release`.
 */
function fakeEngine() {
  const calls: string[] = []
  let fail: Error | undefined
  /** The annotation count of the write `fail` is for; any write when undefined. */
  let failing: number | undefined
  let release: (() => void) | undefined
  let hold = false
  const engines: Engine[] = []
  let created: Promise<void> = Promise.resolve()
  let releaseCreate: (() => void) | undefined
  let checkFails: Error | undefined
  let checkThrows: Error | undefined
  const createEngine = vi.fn(async () => {
    await created
    const n = engines.length + 1
    let queue: Promise<unknown> = Promise.resolve()
    const queued = <T>(work: () => Promise<T>): Promise<T> => {
      const result = queue.then(work)
      queue = result.catch(() => undefined)
      return result
    }
    /** What the document holds: the annotations of the last write that worked. */
    let current = 0
    const doc: EngineDocument = {
      pageCount: 1,
      pageInfo: () => Promise.reject(new Error('unused')),
      renderPage: () => Promise.reject(new Error('unused')),
      write: (input: WriteInput) =>
        queued(async () => {
          calls.push(`write ${n} ${input.annotations?.length ?? 0}`)
          if (hold) {
            hold = false
            await new Promise<void>((r) => (release = r))
          }
          if (fail && (failing === undefined || failing === input.annotations?.length)) {
            const e = fail
            fail = undefined
            failing = undefined
            current = 0
            throw e
          }
          current = input.annotations?.length ?? 0
        }),
      redact: (input) =>
        queued(() => {
          calls.push(`redact ${n} ${input.marks.length}`)
          return Promise.resolve({
            pages: [{ page: 0, marks: input.marks.length, annotationsRemoved: 0 }],
            ownLockedMarks: 0,
            ownLockedRegions: [],
            foreignMarks: 0,
            fieldsSkipped: [],
            sanitised: {
              metadata: false,
              attachments: 0,
              scripts: false,
              thumbnails: false,
              privateData: false,
            },
            hiddenLayers: false,
            signed: false,
          })
        }),
      save: () =>
        queued(() => {
          calls.push(`save ${n}`)
          return Promise.resolve(new Uint8Array([n, current]))
        }),
      close() {
        calls.push(`close ${n}`)
        return Promise.resolve()
      },
    }
    const engine: Engine = {
      open(_bytes, options) {
        calls.push(`open ${n} ${options?.password ?? ''}`)
        return Promise.resolve(doc)
      },
      checkRedaction(_bytes, options) {
        calls.push(`check ${n} ${options?.regions?.length ?? 0}`)
        if (checkThrows) {
          const e = checkThrows
          checkThrows = undefined
          throw e
        }
        if (checkFails) {
          const e = checkFails
          checkFails = undefined
          return Promise.reject(e)
        }
        return Promise.resolve({
          candidates: [],
          file: {
            earlierVersions: 0,
            metadata: false,
            attachments: 0,
            scripts: false,
            hiddenLayers: false,
            signed: false,
          },
        })
      },
      destroy() {
        calls.push(`destroy ${n}`)
        return Promise.resolve()
      },
    }
    engines.push(engine)
    return engine
  })
  const loader = vi.fn<EngineLoader>(() => Promise.resolve({ createEngine }))
  return {
    calls,
    loader,
    createEngine,
    failNext: (e: Error, count?: number) => {
      fail = e
      failing = count
    },
    /** Holds `createEngine` until `releaseCreate`. */
    holdCreate: () => {
      created = new Promise<void>((r) => (releaseCreate = r))
    },
    releaseCreate: () => releaseCreate?.(),
    hold: () => (hold = true),
    /** Makes the next check reject with `e`. */
    failCheck: (e: Error) => (checkFails = e),
    /** Makes the next check throw `e` as it is called, before any promise. */
    throwCheck: (e: Error) => (checkThrows = e),
    release: () => release?.(),
  }
}

const input = (n: number) => () =>
  Promise.resolve({ annotations: Array.from({ length: n }) } as WriteInput)

function saver(fake: ReturnType<typeof fakeEngine>, password?: string) {
  return createSaver({
    loader: fake.loader,
    bytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    password,
  })
}

describe('createSaver', () => {
  it('loads the engine and opens the file once, with the password, across writes', async () => {
    const fake = fakeEngine()
    const s = saver(fake, 'secret')
    await s.write('one', input(1))
    await s.write('two', input(2))
    expect(fake.loader).toHaveBeenCalledTimes(1)
    expect(fake.createEngine).toHaveBeenCalledTimes(1)
    expect(fake.createEngine).toHaveBeenCalledWith()
    expect(fake.calls).toEqual([
      'open 1 secret',
      'write 1 1',
      'save 1',
      'write 1 2',
      'save 1',
    ])
  })

  it('shares a running write and reuses its copy for the same key', async () => {
    const fake = fakeEngine()
    const s = saver(fake)
    const [a, b] = await Promise.all([s.write('k', input(1)), s.write('k', input(1))])
    expect(a).toEqual(b)
    // Each caller has its own array, so one cannot change another's.
    expect(a).not.toBe(b)
    await s.write('k', input(1))
    expect(fake.calls.filter((c) => c.startsWith('write'))).toHaveLength(1)
    await s.write('other', input(1))
    expect(fake.calls.filter((c) => c.startsWith('write'))).toHaveLength(2)
  })

  it('wraps an engine error or an unpaintable drawing as SaveFailed, and forgets it', async () => {
    const fake = fakeEngine()
    const s = saver(fake)
    const writeFailed = new EngineError('write-failed', 'no')
    fake.failNext(writeFailed)
    await expect(s.write('k', input(1))).rejects.toMatchObject({
      name: 'InkError',
      code: 'SaveFailed',
      cause: writeFailed,
    })
    const unpaintable = new UnpaintableError('text')
    await expect(s.write('k', () => Promise.reject(unpaintable))).rejects.toMatchObject({
      code: 'SaveFailed',
      cause: unpaintable,
    })
    // A failed write is not cached, and the engine is kept.
    await expect(s.write('k', input(1))).resolves.toBeInstanceOf(Uint8Array)
    expect(fake.createEngine).toHaveBeenCalledTimes(1)
  })

  it('tells an engine that could not load or start from one that could not write this file', async () => {
    const network = new TypeError('Failed to fetch dynamically imported module')
    const notLoaded = createSaver({
      loader: () => Promise.reject(network),
      bytes: () => Promise.resolve(new Uint8Array([1])),
      password: undefined,
    })
    await expect(notLoaded.write('k', input(1))).rejects.toMatchObject({
      code: 'SaveFailed',
      details: { stage: 'engine' },
      cause: network,
    })
    const noWasm = new Error('wasm instantiate failed')
    const notStarted = createSaver({
      loader: () => Promise.resolve({ createEngine: () => Promise.reject(noWasm) }),
      bytes: () => Promise.resolve(new Uint8Array([1])),
      password: undefined,
    })
    await expect(notStarted.write('k', input(1))).rejects.toMatchObject({
      code: 'SaveFailed',
      details: { stage: 'engine' },
      cause: noWasm,
    })
    // Opening this file and writing into it are the file's failures.
    const fake = fakeEngine()
    const s = saver(fake)
    fake.failNext(new EngineError('write-failed', 'no'))
    await expect(s.write('k', input(1))).rejects.toMatchObject({
      code: 'SaveFailed',
      details: { stage: 'write' },
    })
    const unopenable = new EngineError('invalid-pdf', 'not a PDF')
    const notOpened = createSaver({
      loader: () =>
        Promise.resolve({
          createEngine: () =>
            Promise.resolve({
              open: () => Promise.reject(unopenable),
              destroy: () => Promise.resolve(),
            } as unknown as Engine),
        }),
      bytes: () => Promise.resolve(new Uint8Array([1])),
      password: undefined,
    })
    await expect(notOpened.write('k', input(1))).rejects.toMatchObject({
      code: 'SaveFailed',
      details: { stage: 'write' },
      cause: unopenable,
    })
  })

  it('starts a new engine after an engine failure', async () => {
    const fake = fakeEngine()
    const s = saver(fake)
    fake.failNext(new EngineError('engine-failure', 'gone'))
    await expect(s.write('k', input(1))).rejects.toMatchObject({ code: 'SaveFailed' })
    await s.write('k', input(1))
    expect(fake.createEngine).toHaveBeenCalledTimes(2)
    expect(fake.calls).toContain('destroy 1')
    expect(fake.calls.at(-2)).toBe('write 2 1')
  })

  it('starts a new engine after the engine ran out of memory, which stops it too', async () => {
    const fake = fakeEngine()
    const s = saver(fake)
    fake.failNext(new EngineError('out-of-memory', 'The engine ran out of memory.'))
    await expect(s.write('k', input(1))).rejects.toMatchObject({
      code: 'SaveFailed',
      details: { stage: 'write' },
    })
    await s.write('k', input(1))
    expect(fake.createEngine).toHaveBeenCalledTimes(2)
    expect(fake.calls).toContain('destroy 1')
    expect(fake.calls.at(-2)).toBe('write 2 1')
  })

  it('names the annotation that could not be painted or written', async () => {
    const fake = fakeEngine()
    const s = saver(fake)
    const unpaintable = new UnpaintableError('text')
    const painting = s.write('k', () =>
      Promise.reject(new AnnotationUnwritable('note-1', unpaintable))
    )
    await expect(painting).rejects.toMatchObject({
      code: 'SaveFailed',
      details: { stage: 'write', annotation: 'note-1' },
      cause: unpaintable,
    })
    await expect(painting).rejects.toThrow(/note-1/)
    const refused = new EngineError('write-failed', 'Annotation box-2 could not be…', {
      annotation: 'box-2',
    })
    fake.failNext(refused)
    await expect(s.write('k', input(1))).rejects.toMatchObject({
      code: 'SaveFailed',
      details: { stage: 'write', annotation: 'box-2' },
      cause: refused,
    })
    // A field the engine refused names no annotation.
    fake.failNext(new EngineError('write-failed', 'The form field "x" could not be set'))
    const field = await s.write('k', input(1)).catch((e: unknown) => e)
    expect((field as { details: object }).details).toEqual({ stage: 'write' })
  })

  it('saves each write before the next one starts', async () => {
    const fake = fakeEngine()
    const s = saver(fake)
    fake.hold()
    const a = s.write('a', input(1))
    await vi.waitFor(() => expect(fake.calls).toContain('write 1 1'))
    const b = s.write('b', input(2))
    // B's write would land between A's write and A's save if nothing kept them apart.
    await new Promise((r) => setTimeout(r, 10))
    fake.release()
    expect(await a).toEqual(new Uint8Array([1, 1]))
    expect(await b).toEqual(new Uint8Array([1, 2]))
    expect(fake.calls.slice(1)).toEqual(['write 1 1', 'save 1', 'write 1 2', 'save 1'])
  })

  it("keeps a failed write from changing the next one's copy", async () => {
    const fake = fakeEngine()
    const s = saver(fake)
    // A was asked for first, but its input is ready only once B's write is under way.
    let readyA!: () => void
    const inputA = () => new Promise<void>((r) => (readyA = r)).then(() => input(1)())
    fake.failNext(new EngineError('write-failed', 'no'), 1)
    fake.hold()
    const a = s.write('a', inputA)
    const b = s.write('b', input(2))
    await vi.waitFor(() => expect(fake.calls).toContain('write 1 2'))
    readyA()
    // A's write, failing, would put the document back between B's write and B's save.
    await new Promise((r) => setTimeout(r, 10))
    fake.release()
    expect(await b).toEqual(new Uint8Array([1, 2]))
    await expect(a).rejects.toMatchObject({ code: 'SaveFailed' })
    // B's copy is kept as B's: asking again writes nothing.
    expect(await s.write('b', input(2))).toEqual(new Uint8Array([1, 2]))
    expect(fake.calls.filter((c) => c.startsWith('write'))).toHaveLength(2)
  })

  it('rejects a write in flight as destroyed and destroys the engine', async () => {
    const fake = fakeEngine()
    const s = saver(fake)
    fake.hold()
    const running = s.write('k', input(1))
    await vi.waitFor(() => expect(fake.calls).toContain('write 1 1'))
    s.destroy()
    fake.release()
    await expect(running).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    expect(fake.calls).toContain('destroy 1')
    await expect(s.write('k', input(1))).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
  })

  it('applies, saves and checks in one turn, then opens the file again for a write', async () => {
    const fake = fakeEngine()
    const s = saver(fake, 'secret')
    await s.write('one', input(1))
    const region = {
      page: 0,
      quads: [
        {
          p1: { x: 0, y: 10 },
          p2: { x: 10, y: 10 },
          p3: { x: 0, y: 0 },
          p4: { x: 10, y: 0 },
        },
      ],
    }
    const done = await s.redact(
      () => Promise.resolve({ marks: [{}, {}] }),
      [region, region]
    )
    expect(done.result.pages).toEqual([{ page: 0, marks: 2, annotationsRemoved: 0 }])
    await s.write('two', input(2))
    expect(fake.calls).toEqual([
      'open 1 secret',
      'write 1 1',
      'save 1',
      'redact 1 2',
      'save 1',
      'check 1 2',
      // The redacted copy takes no write: the file is opened again on the same engine.
      'close 1',
      'open 1 secret',
      'write 1 2',
      'save 1',
    ])
  })

  it('wraps a failed apply as RedactionFailed', async () => {
    const network = new TypeError('Failed to fetch dynamically imported module')
    const notLoaded = createSaver({
      loader: () => Promise.reject(network),
      bytes: () => Promise.resolve(new Uint8Array([1])),
      password: undefined,
    })
    await expect(
      notLoaded.redact(() => Promise.resolve({ marks: [] }), [])
    ).rejects.toMatchObject({
      code: 'RedactionFailed',
      details: { stage: 'engine' },
      cause: network,
    })
    const fake = fakeEngine()
    const s = saver(fake)
    const unpaintable = new UnpaintableError('text')
    await expect(
      s.redact(() => Promise.reject(new AnnotationUnwritable('mark-1', unpaintable)), [])
    ).rejects.toMatchObject({
      code: 'RedactionFailed',
      details: { stage: 'apply', annotation: 'mark-1' },
      cause: unpaintable,
    })
  })

  it('fails a redaction at verify whatever the check throws, and drops a stopped engine', async () => {
    for (const [cause, stops] of [
      [new RangeError('bad region'), false],
      [new Error('worker crashed'), false],
      [new EngineError('engine-failure', 'gone'), true],
    ] as const) {
      const fake = fakeEngine()
      const s = saver(fake)
      fake.failCheck(cause)
      await expect(
        s.redact(() => Promise.resolve({ marks: [] }), [])
      ).rejects.toMatchObject({
        code: 'RedactionFailed',
        details: { stage: 'verify' },
        cause,
      })
      expect(fake.calls.includes('destroy 1')).toBe(stops)
    }
  })

  it('fails a redaction at verify when the check throws as it is called', async () => {
    const fake = fakeEngine()
    const s = saver(fake)
    const cause = new RangeError('bad region')
    fake.throwCheck(cause)
    await expect(
      s.redact(() => Promise.resolve({ marks: [] }), [])
    ).rejects.toMatchObject({
      code: 'RedactionFailed',
      details: { stage: 'verify' },
      cause,
    })
  })

  it('destroys an engine that arrives after destroy', async () => {
    const fake = fakeEngine()
    const s = saver(fake)
    fake.holdCreate()
    const running = s.write('k', input(1))
    await vi.waitFor(() => expect(fake.createEngine).toHaveBeenCalled())
    s.destroy()
    fake.releaseCreate()
    await expect(running).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await vi.waitFor(() => expect(fake.calls).toContain('destroy 1'))
    expect(fake.calls).toEqual(['destroy 1'])
  })
})
