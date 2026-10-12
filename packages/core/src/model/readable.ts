export interface Readable<T> {
  get(): T
  subscribe(fn: (value: T) => void): () => void
}

export interface Writable<T> extends Readable<T> {
  set(value: T): void
  update(fn: (value: T) => T): void
}

export function writable<T>(initial: T): Writable<T> {
  let value = initial
  const subs = new Set<(v: T) => void>()
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return
      value = next
      for (const fn of [...subs]) fn(value)
    },
    update(fn) {
      this.set(fn(value))
    },
    subscribe(fn) {
      subs.add(fn)
      return () => {
        subs.delete(fn)
      }
    },
  }
}

/**
 * A readable computed from `source`. It subscribes to the source only while it has
 * subscribers of its own, so an unobserved derived value holds no reference to the source.
 */
export function derived<T, U>(source: Readable<T>, fn: (value: T) => U): Readable<U> {
  const subs = new Set<(v: U) => void>()
  let cached: U
  let stopSource: (() => void) | undefined

  const onSource = (v: T): void => {
    const next = fn(v)
    if (Object.is(next, cached)) return
    cached = next
    for (const sub of [...subs]) sub(next)
  }

  return {
    get: () => (stopSource ? cached : fn(source.get())),
    subscribe(sub) {
      if (!stopSource) {
        cached = fn(source.get())
        stopSource = source.subscribe(onSource)
      }
      subs.add(sub)
      return () => {
        if (!subs.delete(sub) || subs.size > 0) return
        stopSource?.()
        stopSource = undefined
      }
    },
  }
}

export function readonly<T>(w: Writable<T>): Readable<T> {
  return { get: () => w.get(), subscribe: (fn) => w.subscribe(fn) }
}
