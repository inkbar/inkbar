import { describe, expect, it, vi } from 'vitest'

import { Emitter } from './events'

describe('Emitter', () => {
  it('delivers payloads, unsubscribes and clears', () => {
    const e = new Emitter<{ a: number; b: string }>()
    const fa = vi.fn()
    const off = e.on('a', fa)
    e.on('b', fa)
    e.emit('a', 1)
    off()
    e.emit('a', 2)
    e.emit('b', 'x')
    expect(fa.mock.calls).toEqual([[1], ['x']])
    e.clear()
    e.emit('b', 'y')
    expect(fa).toHaveBeenCalledTimes(2)
  })
})
