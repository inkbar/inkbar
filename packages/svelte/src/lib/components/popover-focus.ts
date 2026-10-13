import {
  createFocusReturn,
  shouldKeepOpenOnAnnotation,
  type FocusReturn,
} from '@inkbar/core/dom'

import { peekActivated } from '../context.js'

import type { InkContext } from '../context.js'

/** Core's focus planner, as the two handlers Bits UI's popover content takes. */
export interface PopoverFocusReturn {
  beforeRemove: FocusReturn['beforeRemove']
  /** Bits UI's `onOpenAutoFocus` handler. Leaves the default alone: focus moves into the popover. */
  onOpenAutoFocus: (event: Event) => void
  /** Bits UI's `onCloseAutoFocus` handler. Prevents the default; the planner places focus. */
  onCloseAutoFocus: (event: Event, anchor: HTMLElement | null) => void
}

/** Bits UI's `onInteractOutside` handler: a press that will activate an annotation keeps the popover open. */
export function keepOpenOnAnnotation(event: PointerEvent): void {
  if (shouldKeepOpenOnAnnotation(event.target)) event.preventDefault()
}

/**
 * Bits UI reports the close from an effect teardown, where a reactive read returns the value
 * from before the change that closed the popover. The planner needs the activation as it is
 * now, so it reads the untracked copy.
 *
 * Bits UI also reports a close while a popover opens: its focus scope mounts a second time,
 * and the remount reports a close and then, in the same call, an open. That close is not one,
 * and answering it would focus the anchor a frame before focus moves into the popover. So a
 * close reaches the planner one microtask late, and only when no open was reported after it.
 */
export function useFocusReturn(ctx: InkContext): PopoverFocusReturn {
  const planner = createFocusReturn({
    root: () => ctx.rootEl,
    activated: () => peekActivated(ctx),
  })
  /** Counts the open and close reports, so a close can tell whether anything followed it. */
  let reports = 0
  return {
    beforeRemove: (anchor, prefer) => planner.beforeRemove(anchor, prefer),
    onOpenAutoFocus() {
      reports += 1
    },
    onCloseAutoFocus(event, anchor) {
      // Never the library's own focus return: there is no trigger for it to return to.
      event.preventDefault()
      const report = ++reports
      queueMicrotask(() => {
        if (report === reports) planner.onCloseAutoFocus(event, anchor)
      })
    },
  }
}
