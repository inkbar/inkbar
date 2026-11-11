import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLocalStorage, createMemoryStorage, scopeStorage } from './storage'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A `localStorage` over a map. */
function mapStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  }
}

describe('createMemoryStorage', () => {
  it('round-trips and copies', () => {
    const s = createMemoryStorage()
    const value = { a: [1] }
    void s.set('k', value)
    value.a.push(2)
    const out = s.get('k') as typeof value
    expect(out).toEqual({ a: [1] })
    out.a.push(3)
    expect(s.get('k')).toEqual({ a: [1] })
  })

  it('answers a missing key with undefined', () => {
    expect(createMemoryStorage().get('nope')).toBeUndefined()
  })

  it('starts from initial values and removes keys', () => {
    const s = createMemoryStorage({ a: 1 })
    expect(s.get('a')).toBe(1)
    void s.remove('a')
    expect(s.get('a')).toBeUndefined()
  })
})

describe('createLocalStorage', () => {
  it('writes <prefix>:<key> as JSON', () => {
    const storage = mapStorage()
    vi.stubGlobal('localStorage', storage)
    void createLocalStorage().set('a', { b: 1 })
    expect(storage.getItem('inkbar:a')).toBe('{"b":1}')
  })

  it('uses a custom prefix and removes keys', () => {
    const storage = mapStorage()
    vi.stubGlobal('localStorage', storage)
    const s = createLocalStorage('x')
    void s.set('a', 1)
    expect(storage.getItem('x:a')).toBe('1')
    void s.remove('a')
    expect(storage.getItem('x:a')).toBeNull()
  })

  it('reads another writer', () => {
    const storage = mapStorage()
    vi.stubGlobal('localStorage', storage)
    const s = createLocalStorage()
    expect(s.get('a')).toBeUndefined()
    storage.setItem('inkbar:a', '42')
    expect(s.get('a')).toBe(42)
  })

  it('reads bad JSON as undefined', () => {
    const storage = mapStorage()
    storage.setItem('inkbar:a', '{nope')
    vi.stubGlobal('localStorage', storage)
    expect(createLocalStorage().get('a')).toBeUndefined()
  })

  it('reads undefined when getItem throws', () => {
    const storage = mapStorage()
    vi.stubGlobal('localStorage', storage)
    const s = createLocalStorage()
    storage.getItem = () => {
      throw new Error('denied')
    }
    expect(s.get('a')).toBeUndefined()
  })

  it('falls back to memory when storage is blocked', () => {
    const storage = mapStorage()
    storage.setItem = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.stubGlobal('localStorage', storage)
    const s = createLocalStorage()
    expect(() => s.set('a', 1)).not.toThrow()
    expect(s.get('a')).toBe(1)
  })

  it('rejects when storage is full and keeps the old value', async () => {
    const storage = mapStorage()
    vi.stubGlobal('localStorage', storage)
    const s = createLocalStorage()
    await s.set('a', 1)
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    const failure = await Promise.resolve(s.set('a', 2)).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).cause).toBeInstanceOf(DOMException)
    expect(s.get('a')).toBe(1)
  })

  it('keeps a full store that already holds our keys, rather than using memory', async () => {
    const storage = mapStorage()
    storage.setItem('inkbar:a', '1')
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    vi.stubGlobal('localStorage', storage)
    const s = createLocalStorage()
    expect(s.get('a')).toBe(1)
    await expect(Promise.resolve(s.set('a', 2))).rejects.toThrow(Error)
    expect(s.get('a')).toBe(1)
  })
})

describe('scopeStorage', () => {
  it('prefixes keys', () => {
    const s = createMemoryStorage()
    const scoped = scopeStorage(s, 'plugin.x')
    void scoped.set('k', 1)
    expect(s.get('plugin.x.k')).toBe(1)
    expect(scoped.get('k')).toBe(1)
    void scoped.remove('k')
    expect(s.get('plugin.x.k')).toBeUndefined()
  })
})
