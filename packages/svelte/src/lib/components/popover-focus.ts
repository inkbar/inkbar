import {
  createFocusReturn,
  shouldKeepOpenOnAnnotation,
  type FocusReturn,
} from '@inkbar/core/dom'

import type { InkContext } from '../context.js'

export type { FocusReturn }

/** Bits UI's `onInteractOutside` handler: a press that will activate an annotation keeps the popover open. */
export function keepOpenOnAnnotation(event: PointerEvent): void {
  if (shouldKeepOpenOnAnnotation(event.target)) event.preventDefault()
}

/**
 * Bits UI reports the close from an effect teardown, where a reactive read returns the value
 * from before the change that closed the popover. The planner needs the activation as it is
 * now, so it reads the untracked copy.
 */
export function useFocusReturn(ctx: InkContext): FocusReturn {
  return createFocusReturn({
    root: () => ctx.rootEl,
    activated: () => ctx.peekActivated(),
  })
}
