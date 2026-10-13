import {
  createFocusReturn,
  shouldKeepOpenOnAnnotation,
  type FocusReturn,
} from '@inkbar/core/dom'
import { useMemo } from 'react'

import { useLatest } from '../use-latest'

import type { InkContext } from '../context'

export type { FocusReturn }

/** Radix's `onInteractOutside` handler: a press that will activate an annotation keeps the popover open. */
export function keepOpenOnAnnotation(event: CustomEvent<{ originalEvent: Event }>): void {
  if (shouldKeepOpenOnAnnotation(event.detail.originalEvent.target))
    event.preventDefault()
}

export function useFocusReturn(ctx: InkContext): FocusReturn {
  const latest = useLatest(ctx)
  return useMemo(
    () =>
      createFocusReturn({
        root: () => latest.current.rootEl,
        activated: () => latest.current.activated,
      }),
    [latest]
  )
}
