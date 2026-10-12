import {
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'

import type { Readable } from '@inkbar/core'

/** Mirrors a core `Readable` into a Vue ref. Re-subscribes when the source changes. */
export function useReadable<T>(
  source: MaybeRefOrGetter<Readable<T> | null | undefined>,
  fallback: T
): Readonly<Ref<T>> {
  const value = shallowRef<T>(fallback)
  let off: (() => void) | undefined
  watch(
    () => toValue(source),
    (s) => {
      off?.()
      off = undefined
      if (!s) {
        value.value = fallback
        return
      }
      value.value = s.get()
      off = s.subscribe((v) => {
        value.value = v
      })
    },
    { immediate: true }
  )
  onScopeDispose(() => {
    off?.()
    off = undefined
  })
  return value
}
