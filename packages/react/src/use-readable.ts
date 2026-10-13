import { useCallback, useSyncExternalStore } from 'react'

import type { Readable } from '@inkbar/core'

const noop = (): void => undefined

/**
 * Mirrors a core `Readable` into React. A missing readable yields `fallback`, which must be a
 * stable reference (a module constant): `useSyncExternalStore` compares snapshots by identity
 * and loops on a fresh value. On the server the fallback is rendered.
 */
export function useReadable<T>(readable: Readable<T> | null | undefined, fallback: T): T {
  const subscribe = useCallback(
    (onChange: () => void) => (readable ? readable.subscribe(() => onChange()) : noop),
    [readable]
  )
  const get = useCallback(
    () => (readable ? readable.get() : fallback),
    [readable, fallback]
  )
  const server = useCallback(() => fallback, [fallback])
  return useSyncExternalStore(subscribe, get, server)
}
