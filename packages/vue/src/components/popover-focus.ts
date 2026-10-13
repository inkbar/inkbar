import {
  createFocusReturn,
  shouldKeepOpenOnAnnotation,
  type FocusReturn,
} from '@inkbar/core/dom'

import type { InkContext } from '../context'

export type { FocusReturn }

/** Reka's `interact-outside` handler: a press that will activate an annotation keeps the popover open. */
export function keepOpenOnAnnotation(event: CustomEvent<{ originalEvent: Event }>): void {
  if (shouldKeepOpenOnAnnotation(event.detail.originalEvent.target))
    event.preventDefault()
}

export function useFocusReturn(ctx: InkContext): FocusReturn {
  return createFocusReturn({
    root: () => ctx.rootEl.value,
    activated: () => ctx.activated.value,
  })
}
