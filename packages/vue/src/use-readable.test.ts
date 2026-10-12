import { writable } from '@inkbar/core'
import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { useReadable } from './use-readable'

describe('useReadable', () => {
  it('mirrors a readable into a ref and follows source swaps', async () => {
    const a = writable(1)
    const b = writable(10)
    const source = ref<typeof a | null>(a)
    const scope = effectScope()
    const r = scope.run(() => useReadable(source, 0))!
    expect(r.value).toBe(1)
    a.set(2)
    expect(r.value).toBe(2)
    source.value = b
    await nextTick()
    expect(r.value).toBe(10)
    a.set(3)
    expect(r.value).toBe(10)
    source.value = null
    await nextTick()
    expect(r.value).toBe(0)
    scope.stop()
    b.set(11)
    expect(r.value).toBe(0)
  })

  it('unsubscribes from the current source when its scope is disposed', () => {
    const a = writable(1)
    const scope = effectScope()
    const r = scope.run(() => useReadable(() => a, 0))!
    scope.stop()
    a.set(5)
    expect(r.value).toBe(1)
  })
})
