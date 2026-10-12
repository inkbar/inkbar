import { describe, expect, it, vi } from 'vitest'

import { createPageCache } from './page-cache'

describe('createPageCache', () => {
  it('evicts a rejected lookup, so the next request for the page succeeds', async () => {
    const page = { pageNumber: 2 }
    const fetch = vi
      .fn<(index: number) => Promise<typeof page>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(page)
    const cache = createPageCache(fetch)
    await expect(cache.get(1)).rejects.toThrow('transient')
    await expect(cache.get(1)).resolves.toBe(page)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('shares one pending lookup between callers, then keeps the result', async () => {
    const page = { pageNumber: 1 }
    let resolve!: (p: typeof page) => void
    const fetch = vi.fn(
      () =>
        new Promise<typeof page>((r) => {
          resolve = r
        })
    )
    const cache = createPageCache(fetch)
    // Both callers ask while the lookup is still pending.
    const first = cache.get(0)
    const second = cache.get(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    resolve(page)
    await expect(first).resolves.toBe(page)
    await expect(second).resolves.toBe(page)
    await expect(cache.get(0)).resolves.toBe(page)
    expect(fetch).toHaveBeenCalledTimes(1)
    cache.clear()
    void cache.get(0)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
