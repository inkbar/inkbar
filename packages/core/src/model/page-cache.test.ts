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

  it('shares one lookup per page while it is pending and after it resolves', async () => {
    const fetch = vi.fn((index: number) => Promise.resolve({ index }))
    const cache = createPageCache(fetch)
    const a = cache.get(0)
    expect(cache.get(0)).toBe(a)
    await a
    expect(cache.get(0)).toBe(a)
    expect(fetch).toHaveBeenCalledTimes(1)
    cache.clear()
    void cache.get(0)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
