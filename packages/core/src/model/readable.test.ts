import { describe, expect, it, vi } from 'vitest'

import { derived, readonly, writable, type Readable, type Writable } from './readable'

describe('readable', () => {
  it('notifies subscribers on set and update, not on equal values', () => {
    const w = writable(1)
    const fn = vi.fn<(v: number) => void>()
    const off = w.subscribe(fn)
    w.set(2)
    w.set(2)
    w.update((v) => v + 1)
    expect(fn.mock.calls.map((c) => c[0])).toEqual([2, 3])
    off()
    w.set(4)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(w.get()).toBe(4)
  })

  it('update works detached from the store', () => {
    const w = writable(1)
    const { update } = w
    update((v) => v + 1)
    expect(w.get()).toBe(2)
  })

  it('derived recomputes from its source', () => {
    const w = writable({ a: 1 })
    const d = derived(w, (v) => v.a * 10)
    const fn = vi.fn()
    d.subscribe(fn)
    expect(d.get()).toBe(10)
    w.set({ a: 2 })
    expect(d.get()).toBe(20)
    expect(fn).toHaveBeenCalledWith(20)
  })

  it('derived get() works with no subscribers', () => {
    const w = writable(1)
    const d = derived(w, (v) => v + 1)
    expect(d.get()).toBe(2)
    w.set(5)
    expect(d.get()).toBe(6)
  })

  it('derived releases its source subscription after the last unsubscribe', () => {
    const w = writable(1)
    let live = 0
    const source: Writable<number> = {
      ...w,
      subscribe(fn) {
        live++
        const off = w.subscribe(fn)
        let done = false
        return () => {
          if (done) return
          done = true
          live--
          off()
        }
      },
    }
    const d = derived(source, (v) => v * 2)
    expect(live).toBe(0)
    const off1 = d.subscribe(() => {})
    const off2 = d.subscribe(() => {})
    expect(live).toBe(1)
    off1()
    expect(live).toBe(1)
    off2()
    expect(live).toBe(0)
    w.set(3)
    expect(d.get()).toBe(6)
    const off3 = d.subscribe(() => {})
    expect(live).toBe(1)
    off3()
    expect(live).toBe(0)
  })

  it('derived does not notify when the derived value is unchanged', () => {
    const w = writable(1)
    const d = derived(w, (v) => v % 2)
    const fn = vi.fn()
    d.subscribe(fn)
    w.set(3)
    expect(fn).not.toHaveBeenCalled()
  })

  it('readonly hides set', () => {
    const w = writable('x')
    const r: Readable<string> = readonly(w)
    expect('set' in r).toBe(false)
    expect(r.get()).toBe('x')
  })
})

describe('reference stability', () => {
  it('writable and derived return the same reference until the value changes', () => {
    const w = writable<readonly number[]>([1])
    expect(w.get()).toBe(w.get())
    const d = derived(w, (v) => v.map((n) => n * 2))
    const stop = d.subscribe(() => undefined)
    expect(d.get()).toBe(d.get())
    const before = d.get()
    w.set([1])
    expect(d.get()).not.toBe(before)
    w.set(w.get())
    expect(d.get()).toBe(d.get())
    stop()
  })
})
