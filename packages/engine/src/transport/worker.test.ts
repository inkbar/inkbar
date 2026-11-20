import { afterEach, expect, test, vi } from 'vitest'

import { engineOver } from '../engine.ts'

import { createWorkerTransport } from './worker.ts'

import type { FromWorker, Request, ToWorker } from '../protocol.ts'

const STOPPED = 'The engine stopped after an internal error; create a new engine.'

/** A stand-in Worker: `answer` replies to each request the page sends. */
class FakeWorker extends EventTarget {
  terminated = false
  constructor(private readonly answer: (message: ToWorker) => FromWorker[]) {
    super()
  }

  postMessage(message: ToWorker): void {
    if ('type' in message && message.type === 'abort') return
    const replies =
      'type' in message ? [{ type: 'ready' } as const] : this.answer(message)
    queueMicrotask(() => {
      for (const data of replies)
        this.dispatchEvent(new MessageEvent('message', { data }))
    })
  }

  terminate(): void {
    this.terminated = true
  }
}

test('after the worker reports an internal error the engine stops and terminates it', async () => {
  const fake = new FakeWorker((message) => {
    if (!('request' in message)) return []
    if (message.request.op === 'open')
      return [{ id: message.id, ok: true, value: { id: 1, pageCount: 1 } }]
    return [
      {
        id: message.id,
        ok: false,
        error: { code: 'out-of-memory', message: 'The engine ran out of memory.' },
      },
      { type: 'failed', error: { code: 'engine-failure', message: STOPPED } },
    ]
  })
  const engine = engineOver(
    await createWorkerTransport(fake as unknown as Worker, new Uint8Array(0))
  )
  const doc = await engine.open(new Uint8Array([1]))
  await expect(doc.renderPage(0)).rejects.toMatchObject({ code: 'out-of-memory' })
  expect(fake.terminated).toBe(true)
  await expect(doc.pageInfo(0)).rejects.toMatchObject({
    code: 'engine-failure',
    message: STOPPED,
  })
  await expect(engine.open(new Uint8Array([1]))).rejects.toMatchObject({
    message: STOPPED,
  })
  await expect(doc.close()).resolves.toBeUndefined()
  await expect(engine.destroy()).resolves.toBeUndefined()
})

/** A stand-in Worker that answers start-up and `open` at once and leaves other calls to the test. */
class ManualWorker extends EventTarget {
  terminated = false
  readonly waiting: number[] = []
  /** Every message the page posted, start-up included. */
  readonly posted: ToWorker[] = []

  postMessage(message: ToWorker): void {
    this.posted.push(message)
    let reply: FromWorker | undefined
    if ('type' in message) {
      if (message.type === 'init') reply = { type: 'ready' }
    } else if (message.request.op === 'open')
      reply = { id: message.id, ok: true, value: { id: 1, pageCount: 1 } }
    else this.waiting.push(message.id)
    if (reply)
      queueMicrotask(() =>
        this.dispatchEvent(new MessageEvent('message', { data: reply }))
      )
  }

  answer(id: number): void {
    const data: FromWorker = { id, ok: true, value: { width: 1, height: 1, rotation: 0 } }
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  refuse(id: number): void {
    const data: FromWorker = {
      id,
      ok: false,
      error: { code: 'aborted', message: 'The call was aborted.' },
    }
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  /** The abort messages posted so far. */
  get aborts(): ToWorker[] {
    return this.posted.filter((message) => 'type' in message && message.type === 'abort')
  }

  terminate(): void {
    this.terminated = true
  }
}

async function manualEngine() {
  const worker = new ManualWorker()
  const engine = engineOver(
    await createWorkerTransport(worker as unknown as Worker, new Uint8Array(0))
  )
  const doc = await engine.open(new Uint8Array([1]))
  return { worker, engine, doc }
}

afterEach(() => {
  vi.useRealTimers()
})

test('destroy lets a running call that answers in time finish, then terminates the worker', async () => {
  vi.useFakeTimers()
  const { worker, engine, doc } = await manualEngine()
  const running = doc.pageInfo(0)
  await vi.advanceTimersByTimeAsync(0)
  const destroyed = engine.destroy()
  await vi.advanceTimersByTimeAsync(500)
  expect(worker.terminated).toBe(false)
  worker.answer(worker.waiting[0]!)
  await expect(running).resolves.toMatchObject({ width: 1 })
  await expect(destroyed).resolves.toBeUndefined()
  expect(worker.terminated).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

test('destroy stops waiting after two seconds and aborts the running call', async () => {
  vi.useFakeTimers()
  const { worker, engine, doc } = await manualEngine()
  const running = doc.pageInfo(0)
  const runningSettled = running.catch((reason: unknown) => reason)
  await vi.advanceTimersByTimeAsync(0)
  const queued = doc.pageInfo(0)
  const queuedSettled = queued.catch((reason: unknown) => reason)
  let done = false
  const destroyed = engine.destroy().then(() => (done = true))
  // The queued call is rejected at once, not after the bound.
  await vi.advanceTimersByTimeAsync(0)
  expect(await queuedSettled).toMatchObject({ code: 'aborted' })
  await vi.advanceTimersByTimeAsync(1_990)
  expect(done).toBe(false)
  expect(worker.terminated).toBe(false)
  await vi.advanceTimersByTimeAsync(10)
  await destroyed
  expect(worker.terminated).toBe(true)
  expect(await runningSettled).toMatchObject({ name: 'EngineError', code: 'aborted' })
  expect(vi.getTimerCount()).toBe(0)
  // A late answer from the terminated worker changes nothing.
  worker.answer(worker.waiting[0]!)
  await expect(doc.pageInfo(0)).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(engine.open(new Uint8Array([1]))).rejects.toMatchObject({
    code: 'engine-failure',
  })
  await expect(doc.close()).resolves.toBeUndefined()
  await expect(engine.destroy()).resolves.toBeUndefined()
})

test('a second destroy returns the first one', async () => {
  const { engine } = await manualEngine()
  const transportDestroy = engine.destroy()
  expect(engine.destroy()).toBe(transportDestroy)
  await transportDestroy
})

test('aborting a running render tells the worker which call to stop', async () => {
  const { worker, doc } = await manualEngine()
  const c = new AbortController()
  const running = doc.renderPage(0, { signal: c.signal })
  await vi.waitUntil(() => worker.waiting.length === 1)
  const id = worker.waiting[0]!
  c.abort()
  expect(worker.aborts).toEqual([{ type: 'abort', id }])
  worker.refuse(id)
  await expect(running).rejects.toMatchObject({ name: 'EngineError', code: 'aborted' })
  // The listener is gone once the call settled: a second abort posts nothing.
  c.abort()
  expect(worker.aborts).toHaveLength(1)
})

test('aborting a queued render rejects it without telling the worker', async () => {
  const { worker, doc } = await manualEngine()
  const first = doc.pageInfo(0)
  await vi.waitUntil(() => worker.waiting.length === 1)
  const c = new AbortController()
  const queued = doc.renderPage(0, { signal: c.signal })
  c.abort()
  await expect(queued).rejects.toMatchObject({ code: 'aborted' })
  expect(worker.aborts).toEqual([])
  worker.answer(worker.waiting[0]!)
  await expect(first).resolves.toMatchObject({ width: 1 })
  expect(worker.waiting).toHaveLength(1)
})

test('a render that answers before its abort is handled still resolves, once', async () => {
  const { worker, doc } = await manualEngine()
  const c = new AbortController()
  const running = doc.renderPage(0, { signal: c.signal })
  await vi.waitUntil(() => worker.waiting.length === 1)
  const id = worker.waiting[0]!
  worker.answer(id)
  c.abort()
  // The reply came first, so the abort is not sent and the call keeps its result.
  await expect(running).resolves.toMatchObject({ width: 1 })
  expect(worker.aborts).toEqual([])
})

test('aborting a running call that is not a render posts nothing', async () => {
  const { worker, engine } = await manualEngine()
  const c = new AbortController()
  const running = engine.checkRedaction(new Uint8Array([1]), { signal: c.signal })
  await vi.waitUntil(() => worker.waiting.length === 1)
  c.abort()
  expect(worker.aborts).toEqual([])
  worker.answer(worker.waiting[0]!)
  await running
})

test('destroy stops a running render rather than waiting for it', async () => {
  const { worker, engine, doc } = await manualEngine()
  const running = doc.renderPage(0).catch((reason: unknown) => reason)
  await vi.waitUntil(() => worker.waiting.length === 1)
  const id = worker.waiting[0]!
  const destroyed = engine.destroy()
  expect(worker.aborts).toEqual([{ type: 'abort', id }])
  worker.refuse(id)
  await destroyed
  expect(worker.terminated).toBe(true)
  expect(await running).toMatchObject({ code: 'aborted' })
})

test('fallback font URLs reach the worker absolute, and bytes pass through', async () => {
  const worker = new ManualWorker()
  const bytes = new Uint8Array([1, 2, 3])
  await createWorkerTransport(worker as unknown as Worker, new Uint8Array(0), {
    fallbackFonts: {
      japanese: 'https://fonts.test/jp.otf',
      korean: new URL('https://fonts.test/kr.otf'),
      default: bytes,
    },
  })
  const init = worker.posted.find(
    (message) => 'type' in message && message.type === 'init'
  )
  expect(init).toMatchObject({
    fallbackFonts: {
      japanese: 'https://fonts.test/jp.otf',
      korean: 'https://fonts.test/kr.otf',
      default: bytes,
    },
  })
})

test('a relative font URL with no page to resolve it against rejects and terminates the worker', async () => {
  const worker = new ManualWorker()
  const error: unknown = await createWorkerTransport(
    worker as unknown as Worker,
    new Uint8Array(0),
    { fallbackFonts: { japanese: 'fonts/jp.otf' } }
  ).catch((reason: unknown) => reason)
  expect(error).toMatchObject({ code: 'engine-failure' })
  expect((error as Error).message).toContain('fonts/jp.otf')
  expect(worker.terminated).toBe(true)
  expect(worker.posted).toEqual([])
})

test('without fallback fonts the start-up message carries none', async () => {
  const worker = new ManualWorker()
  await createWorkerTransport(worker as unknown as Worker, new Uint8Array(0))
  expect(worker.posted[0]).not.toHaveProperty('fallbackFonts')
})

test.each(['write', 'redact'] as const)(
  'aborting a running %s tells the worker which call to stop',
  async (op) => {
    const worker = new ManualWorker()
    const transport = await createWorkerTransport(
      worker as unknown as Worker,
      new Uint8Array(0)
    )
    const c = new AbortController()
    const input = op === 'write' ? {} : { marks: [] }
    const running = transport.call({ op, doc: 1, input } as Request, c.signal)
    await vi.waitUntil(() => worker.waiting.length === 1)
    const id = worker.waiting[0]!
    c.abort()
    expect(worker.aborts).toEqual([{ type: 'abort', id }])
    worker.refuse(id)
    await expect(running).rejects.toMatchObject({ code: 'aborted' })
    await transport.destroy()
  }
)

test.each(['write', 'redact'] as const)(
  'destroy during a %s tells the worker to stop it, so a font fetch ends at once',
  async (op) => {
    const { worker, engine, doc } = await manualEngine()
    const running = op === 'write' ? doc.write({}) : doc.redact({ marks: [] })
    await vi.waitUntil(() => worker.waiting.length === 1)
    const id = worker.waiting[0]!
    const destroyed = engine.destroy()
    expect(worker.aborts).toEqual([{ type: 'abort', id }])
    worker.refuse(id)
    await expect(running).rejects.toMatchObject({ code: 'aborted' })
    await expect(destroyed).resolves.toBeUndefined()
  }
)

test('destroy does not tell a running pageInfo to stop', async () => {
  const { worker, engine, doc } = await manualEngine()
  const running = doc.pageInfo(0)
  await vi.waitUntil(() => worker.waiting.length === 1)
  const destroyed = engine.destroy()
  expect(worker.aborts).toEqual([])
  worker.answer(worker.waiting[0]!)
  await running
  await destroyed
})
