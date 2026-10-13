import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * A ref that always holds the latest render's value, for callbacks that outlive a render
 * (core's `onChange`, effects keyed on something else). Updated in a layout effect, so it is
 * current before any child's layout effect or passive effect runs; declare it before the
 * effects that read it.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}
