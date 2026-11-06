import { readonly, writable, type Readable } from '@inkbar/core'
import { watch } from 'vue'

/**
 * A core `Readable` that follows a Vue source, for the core controllers and painters that
 * components build on. Call it in `setup`: it stops following with the component.
 */
export function toReadable<T>(source: () => T): Readable<T> {
  const store = writable(source())
  watch(source, (value) => store.set(value), { flush: 'sync' })
  return readonly(store)
}
