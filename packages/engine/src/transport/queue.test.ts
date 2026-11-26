import { expect, test } from 'vitest'

import { nextTask } from '../native/core.ts'

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

test('a job waiting behind one that yields between slices starts only once it settles', async () => {
  const queue = new CallQueue()
  const log: string[] = []
  const sliced = queue.enqueue(async () => {
    for (let slice = 0; slice < 5; slice++) {
      log.push(`slice ${slice}`)
      // The yield a sliced render makes, so anything waiting could run meanwhile.
      await nextTask()
    }
    throw new Error('stopped')
  })
  const waiting = queue.enqueue(() => {
    log.push('waiting')
    return 'ran'
  })
  await expect(sliced).rejects.toThrow('stopped')
  await expect(waiting).resolves.toBe('ran')
  expect(log).toEqual(['slice 0', 'slice 1', 'slice 2', 'slice 3', 'slice 4', 'waiting'])
})

/** Holds the queue's first job open so the ones queued after it wait. */
const gate = (queue: CallQueue) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let started!: () => void
  const running = new Promise<void>((resolve) => (started = resolve))
  const first = queue.enqueue(async () => {
    started()
    await held
    return 'first'
  })
  return { release, running, first }
}

test('background jobs wait for every other waiting job, each kind in its own order', async () => {
  const queue = new CallQueue()
  const log: string[] = []
  const { release, running, first } = gate(queue)
  await running
  const job = (name: string) => () => {
    log.push(name)
    return name
  }
  const rest = [
    queue.enqueue(job('b1'), undefined, { background: true }),
    queue.enqueue(job('n1')),
    queue.enqueue(job('b2'), undefined, { background: true }),
    queue.enqueue(job('n2')),
  ]
  release()
  await Promise.all([first, ...rest])
  expect(log).toEqual(['n1', 'n2', 'b1', 'b2'])
})

test('a running background job is not interrupted by a normal one', async () => {
  const queue = new CallQueue()
  const log: string[] = []
  let started!: () => void
  const running = new Promise<void>((resolve) => (started = resolve))
  const bg = queue.enqueue(
    async () => {
      log.push('start bg')
      started()
      await later(20)
      log.push('end bg')
    },
    undefined,
    { background: true }
  )
  await running
  const normal = queue.enqueue(() => log.push('normal'))
  await Promise.all([bg, normal])
  expect(log).toEqual(['start bg', 'end bg', 'normal'])
})

test('a queued background job can be aborted and never runs', async () => {
  const queue = new CallQueue()
  const { release, running, first } = gate(queue)
  await running
  const c = new AbortController()
  let ran = false
  const bg = queue.enqueue(() => (ran = true), c.signal, { background: true })
  const other = queue.enqueue(() => 'other')
  c.abort()
  await expect(bg).rejects.toMatchObject({ code: 'aborted' })
  release()
  await expect(Promise.all([first, other])).resolves.toEqual(['first', 'other'])
  expect(ran).toBe(false)
})

test('destroy aborts queued jobs of both kinds', async () => {
  const queue = new CallQueue()
  const { release, running, first } = gate(queue)
  await running
  const bg = queue.enqueue(() => 'bg', undefined, { background: true })
  const normal = queue.enqueue(() => 'normal')
  const rejected = Promise.all([
    expect(bg).rejects.toMatchObject({ code: 'aborted' }),
    expect(normal).rejects.toMatchObject({ code: 'aborted' }),
  ])
  const destroyed = queue.destroy()
  release()
  await destroyed
  await expect(first).resolves.toBe('first')
  await rejected
})
