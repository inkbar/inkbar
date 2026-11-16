import { expect, test } from 'vitest'

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
