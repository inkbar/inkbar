import { afterEach, expect, test, vi } from 'vitest'

import { anySignal, timeoutSignal } from './signals.ts'

afterEach(() => {
  vi.useRealTimers()
})

test('aborts with the reason of the first source to abort, then leaves the sources', () => {
  const a = new AbortController()
  const b = new AbortController()
  const remove = vi.spyOn(b.signal, 'removeEventListener')
  const combined = anySignal([a.signal, undefined, b.signal])
  expect(combined.signal.aborted).toBe(false)
  a.abort('first')
  expect(combined.signal.aborted).toBe(true)
  expect(combined.signal.reason).toBe('first')
  expect(remove).toHaveBeenCalled()
  b.abort('second')
  expect(combined.signal.reason).toBe('first')
})

test('a source already aborted aborts it at once', () => {
  const combined = anySignal([new AbortController().signal, AbortSignal.abort('done')])
  expect(combined.signal.aborted).toBe(true)
  expect(combined.signal.reason).toBe('done')
})

test('one source is passed through, and dispose removes every listener', () => {
  const only = new AbortController().signal
  expect(anySignal([only, undefined]).signal).toBe(only)
  const a = new AbortController()
  const b = new AbortController()
  const combined = anySignal([a.signal, b.signal])
  combined.dispose()
  a.abort()
  expect(combined.signal.aborted).toBe(false)
})

test('does not use AbortSignal.any', () => {
  const any = vi.spyOn(AbortSignal, 'any')
  anySignal([new AbortController().signal, new AbortController().signal])
  expect(any).not.toHaveBeenCalled()
})

test('a timeout signal aborts after its time, and not once disposed', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const bound = timeoutSignal(100)
  vi.advanceTimersByTime(99)
  expect(bound.timedOut()).toBe(false)
  vi.advanceTimersByTime(1)
  expect(bound.timedOut()).toBe(true)
  expect(bound.signal.reason).toMatchObject({ name: 'TimeoutError' })
  const cleared = timeoutSignal(100)
  cleared.dispose()
  vi.advanceTimersByTime(200)
  expect(cleared.timedOut()).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})
