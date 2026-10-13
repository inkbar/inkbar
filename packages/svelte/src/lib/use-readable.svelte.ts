import { fromStore, type Readable as SvelteReadable } from 'svelte/store'

import type { Readable } from '@inkbar/core'

export interface ReadableRef<T> {
  readonly current: T
}

/** Core's `subscribe` does not call back with the current value; Svelte's store contract does. */
function asStore<T>(source: Readable<T>): SvelteReadable<T> {
  return {
    subscribe(run) {
      run(source.get())
      return source.subscribe(run)
    },
  }
}

/**
 * Mirrors a core `Readable` into Svelte. `source` is a getter, so a readable that appears later
 * (the document's status once it opens) is followed, and a change of source re-subscribes.
 * `fromStore` reads synchronously when nothing is tracking, so the first render shows the
 * readable's value rather than `fallback`; under an effect or template it subscribes through
 * `createSubscriber`, so subscriptions start and stop with the readers.
 */
export function useReadable<T>(
  source: () => Readable<T> | null | undefined,
  fallback: T
): ReadableRef<T> {
  const store = $derived.by(() => {
    const s = source()
    return s ? fromStore(asStore(s)) : null
  })
  return {
    get current() {
      return store ? store.current : fallback
    },
  }
}
