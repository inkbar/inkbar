import { expect, test } from 'vitest'

import { CallQueue } from './queue.ts'

const later = (ms = 5) => new Promise<void>((resolve) => setTimeout(resolve, ms))

test('jobs run one at a time, in order', async () => {
  const queue = new CallQueue()
  const log: string[] = []
  const job = (name: string) => async () => {
    log.push(`start ${name}`)
    await later()
    log.push(`end ${name}`)
    return name
  }
  const results = await Promise.all([
    queue.enqueue(job('a')),
    queue.enqueue(job('b')),
    queue.enqueue(job('c')),
  ])
  expect(results).toEqual(['a', 'b', 'c'])
  expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c'])
})

test('a job that has started finishes even when its signal aborts', async () => {
  const queue = new CallQueue()
  const c = new AbortController()
  let started!: () => void
  const running = new Promise<void>((resolve) => (started = resolve))
  const first = queue.enqueue(async () => {
    started()
    await later()
    return 'done'
  }, c.signal)
  await running
  c.abort()
  await expect(first).resolves.toBe('done')
})

test('destroy waits for the running job and aborts the queued ones', async () => {
  const queue = new CallQueue()
  let ran = false
  let started!: () => void
  const running = new Promise<void>((resolve) => (started = resolve))
  const first = queue.enqueue(async () => {
    started()
    await later(20)
    return 'done'
  })
  const second = queue.enqueue(() => {
    ran = true
  })
  await running
  const rejected = expect(second).rejects.toMatchObject({ code: 'aborted' })
  await queue.destroy()
  await expect(first).resolves.toBe('done')
  await rejected
  expect(ran).toBe(false)
  await expect(queue.enqueue(() => 1)).rejects.toMatchObject({ code: 'engine-failure' })
})

test('a failing job rejects its caller and the queue carries on', async () => {
  const queue = new CallQueue()
  const bad = queue.enqueue(() => {
    throw new RangeError('no')
  })
  const good = queue.enqueue(() => 'ok')
  await expect(bad).rejects.toBeInstanceOf(RangeError)
  await expect(good).resolves.toBe('ok')
})

test('a failing beforeEach rejects that job and the queue keeps draining', async () => {
  let calls = 0
  const queue = new CallQueue(() => {
    calls++
    return calls === 1 ? Promise.reject(new Error('hook')) : Promise.resolve()
  })
  const first = queue.enqueue(() => 'a')
  const second = queue.enqueue(() => 'b')
  await expect(first).rejects.toThrow('hook')
  await expect(second).resolves.toBe('b')
})
