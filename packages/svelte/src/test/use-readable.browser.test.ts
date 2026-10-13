import { writable, type Writable } from '@inkbar/core'
import { flushSync } from 'svelte'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-svelte'

import ReadableProbe from './harness/ReadableProbe.svelte'

/** A writable that counts its subscribers. */
function counted(
  initial: string
): Writable<string> & { readonly subscribers: () => number } {
  const inner = writable(initial)
  let n = 0
  return {
    get: () => inner.get(),
    set: inner.set,
    update: inner.update,
    subscribe(fn) {
      n++
      const off = inner.subscribe(fn)
      return () => {
        n--
        off()
      }
    },
    subscribers: () => n,
  }
}

describe('useReadable', () => {
  it('renders the current value at once, follows sets, and the fallback for a missing source', async () => {
    const source = counted('one')
    const screen = await render(ReadableProbe, { source })
    const out = screen.getByTestId('value')
    // No fallback flash: the first read is the readable's own value.
    expect(out.element().textContent).toBe('one')
    source.set('two')
    flushSync()
    await expect.element(out).toHaveTextContent('two')
    await screen.rerender({ source: null })
    await expect.element(out).toHaveTextContent('fallback')
  })

  it('re-subscribes when the source changes and drops the old subscription (Review Focus 3)', async () => {
    const first = counted('a')
    const second = counted('b')
    const screen = await render(ReadableProbe, { source: first })
    const out = screen.getByTestId('value')
    await expect.element(out).toHaveTextContent('a')
    expect(first.subscribers()).toBe(1)
    await screen.rerender({ source: second })
    await expect.element(out).toHaveTextContent('b')
    // Subscriptions wind down a microtask after the last reader lets go.
    await expect.poll(() => first.subscribers()).toBe(0)
    expect(second.subscribers()).toBe(1)
    first.set('a2')
    flushSync()
    expect(out.element().textContent).toBe('b')
  })

  it('unsubscribes when the owner is destroyed', async () => {
    const source = counted('x')
    const screen = await render(ReadableProbe, { source })
    await expect.element(screen.getByTestId('value')).toHaveTextContent('x')
    expect(source.subscribers()).toBe(1)
    await screen.unmount()
    await expect.poll(() => source.subscribers()).toBe(0)
  })
})
