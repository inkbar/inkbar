/**
 * Internal (not exported from the package): one in-flight or settled lookup per page index.
 * A lookup that rejects is evicted, so the next request for that page asks again instead of
 * replaying the failure for the rest of the session.
 */
export interface PageCache<T> {
  get(index: number): Promise<T>
  clear(): void
}

export function createPageCache<T>(fetch: (index: number) => Promise<T>): PageCache<T> {
  const cache = new Map<number, Promise<T>>()
  return {
    get(index) {
      const cached = cache.get(index)
      if (cached) return cached
      const fetched = fetch(index)
      cache.set(index, fetched)
      fetched.catch(() => {
        if (cache.get(index) === fetched) cache.delete(index)
      })
      return fetched
    },
    clear: () => cache.clear(),
  }
}
