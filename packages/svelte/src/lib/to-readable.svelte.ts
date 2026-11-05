import { readonly, writable, type Readable } from '@inkbar/core'
import { untrack } from 'svelte'

/**
 * A core `Readable` that follows a Svelte getter, for the core controllers and painters that
 * components build on. Call it while a component initialises: it takes each new value in a
 * pre-effect, before the DOM updates, and stops with the component.
 */
export function toReadable<T>(source: () => T): Readable<T> {
  const store = writable(untrack(source))
  $effect.pre(() => {
    const value = source()
    untrack(() => store.set(value))
  })
  return readonly(store)
}
