import { EngineError } from '@inkbar/engine'
import { describe, expect, it, vi } from 'vitest'

import { UnpaintableError } from '../annotations/drawing/pdf/paint'

import { createSaver, type EngineLoader } from './saver'

import type { Engine, EngineDocument, WriteInput } from '@inkbar/engine'

/** A stand-in engine that records its calls; `fail` makes the next write reject with it. */
function fakeEngine() {
  const calls: string[] = []
  let fail: Error | undefined
  let release: (() => void) | undefined
  let hold = false
  const engines: Engine[] = []
  let created: Promise<void> = Promise.resolve()
  let releaseCreate: (() => void) | undefined
  const createEngine = vi.fn(async () => {
    await created
    const n = engines.length + 1
    const doc: EngineDocument = {
      pageCount: 1,
      pageInfo: () => Promise.reject(new Error('unused')),
      renderPage: () => Promise.reject(new Error('unused')),
      async write(input: WriteInput) {
        calls.push(`write ${n} ${input.annotations?.length ?? 0}`)
        if (hold) await new Promise<void>((r) => (release = r))
        if (fail) {
          const e = fail
          fail = undefined
          throw e
        }
      },
      save() {
        calls.push(`save ${n}`)
        return Promise.resolve(new Uint8Array([n, calls.length]))
      },
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
    failNext: (e: Error) => (fail = e),
    /** Holds `createEngine` until `releaseCreate`. */
    holdCreate: () => {
      created = new Promise<void>((r) => (releaseCreate = r))
    },
    releaseCreate: () => releaseCreate?.(),
    hold: () => (hold = true),
    release: () => {
      hold = false
      release?.()
    },
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
