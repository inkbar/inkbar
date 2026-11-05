import { readonly, writable, type Readable } from '@inkbar/core'
import { useLayoutEffect, useState } from 'react'

/**
 * A core `Readable` that follows a React value, for the core controllers and painters that
 * components build on. The same readable for the component's life; it takes each new value in
 * a layout effect, so declare it before the effects that hand it to core.
 */
export function useToReadable<T>(value: T): Readable<T> {
  const [store] = useState(() => writable(value))
  useLayoutEffect(() => {
    store.set(value)
  }, [store, value])
  const [view] = useState(() => readonly(store))
  return view
}
