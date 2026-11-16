import { afterEach, expect, test, vi } from 'vitest'

import { engineOver } from '../engine.ts'

import { createWorkerTransport } from './worker.ts'

import type { FromWorker, ToWorker } from '../protocol.ts'

const STOPPED = 'The engine stopped after an internal error; create a new engine.'

/** A stand-in Worker: `answer` replies to each request the page sends. */
class FakeWorker extends EventTarget {
  terminated = false
  constructor(private readonly answer: (message: ToWorker) => FromWorker[]) {
    super()
  }

  postMessage(message: ToWorker): void {
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
    if (!('id' in message)) return []
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

  postMessage(message: ToWorker): void {
    let reply: FromWorker | undefined
    if ('type' in message) reply = { type: 'ready' }
    else if (message.request.op === 'open')
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
