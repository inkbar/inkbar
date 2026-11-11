// What the viewer keeps between visits: sidebar widths, saved signatures, plugin settings. The
// host owns storage through an `InkStorage`; core ships a memory store and a localStorage one.
// Inkbar touches neither localStorage nor the network unless the host passes a store that does.

/** Where the viewer keeps small values. Values are JSON; the host's store may be async. */
export interface InkStorage {
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- documents that a promise is allowed
  get(key: string): unknown | Promise<unknown>
  set(key: string, value: unknown): void | Promise<void>
  remove(key: string): void | Promise<void>
}

const copy = (value: unknown): unknown =>
  value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown)

/** Values in memory, gone on reload. The default when a host passes no store. */
export function createMemoryStorage(initial: Record<string, unknown> = {}): InkStorage {
  const map = new Map<string, unknown>(
    Object.entries(initial).map(([k, v]) => [k, copy(v)])
  )
  return {
    get: (key) => copy(map.get(key)),
    set(key, value) {
      map.set(key, copy(value))
    },
    remove(key) {
      map.delete(key)
    },
  }
}

/**
 * A `localStorage` store whose keys go to storage as `keyOf` maps them. Storage is probed once.
 * Where it is blocked (it refuses even a tiny test write, as in some private windows) values
 * stay in memory for the page's life. A full store that already `holdsOurs` is kept, so its
 * values show and writes reject.
 */
function createLocalStore(
  keyOf: (key: string) => string,
  probeKey: string,
  holdsOurs: (storage: Storage) => boolean
): InkStorage {
  const storage = ((): Storage | undefined => {
    try {
      const s = globalThis.localStorage ?? undefined
      if (!s) return undefined
      try {
        s.setItem(probeKey, '1')
        s.removeItem(probeKey)
      } catch {
        return holdsOurs(s) ? s : undefined
      }
      return s
    } catch {
      return undefined
    }
  })()
  if (!storage) return createMemoryStorage()
  return {
    get(key) {
      try {
        const raw = storage.getItem(keyOf(key))
        return raw === null ? undefined : (JSON.parse(raw) as unknown)
      } catch {
        return undefined
      }
    },
    set(key, value) {
      try {
        storage.setItem(keyOf(key), JSON.stringify(value))
      } catch (cause) {
        return Promise.reject(
          new Error(`Browser storage could not save "${key}"`, { cause })
        )
      }
      return undefined
    },
    remove(key) {
      try {
        storage.removeItem(keyOf(key))
      } catch {
        // Nothing to remove from a storage that cannot be reached.
      }
    },
  }
}

/**
 * Values in `localStorage` as JSON under `<prefix>:<key>`, read on every call so another tab's
 * write shows. Where storage is blocked the values stay in memory. A `set` that storage
 * refuses, as when it is full, keeps the old value and returns a rejected promise.
 */
export function createLocalStorage(prefix = 'inkbar'): InkStorage {
  const start = `${prefix}:`
  return createLocalStore(
    (key) => start + key,
    `${start}probe`,
    (s) => {
      for (let i = 0; i < s.length; i++) if (s.key(i)?.startsWith(start)) return true
      return false
    }
  )
}

/**
 * Like `createLocalStorage`, but keys reach storage exactly as given, with no prefix. Internal:
 * the signature store keeps its caller's key. `own` is the key whose presence marks a full
 * store as ours.
 */
export function createRawLocalStorage(own: string): InkStorage {
  return createLocalStore(
    (key) => key,
    `${own}:probe`,
    (s) => s.getItem(own) !== null
  )
}

/** Keys under `<prefix>.`: `get('x')` reads `<prefix>.x`. */
export function scopeStorage(storage: InkStorage, prefix: string): InkStorage {
  const scoped = (key: string): string => `${prefix}.${key}`
  return {
    get: (key) => storage.get(scoped(key)),
    set: (key, value) => storage.set(scoped(key), value),
    remove: (key) => storage.remove(scoped(key)),
  }
}
