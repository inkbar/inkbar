/*
 * Where a toolbar menu puts focus as it opens: the first item when ArrowDown opened it, else the
 * checked one. Bits can remount a popover's focus scope just after it opens, which sends focus
 * to the trigger and runs the open-focus callback again; by then the user may have moved on, so
 * a repeat run goes back to the item they last focused.
 */
import { focusInitialMenuItem, menuItems } from '@inkbar/core/dom'

export interface MenuOpenFocus {
  /** Makes the next open start on the first item (ArrowDown on the trigger). */
  first: () => void
  /** For the content's `onOpenAutoFocus`. */
  onOpenAutoFocus: (e: Event, menu: HTMLElement | null) => void
  /** For the content's `onfocusin`: remembers where the user is. */
  onfocusin: (e: FocusEvent) => void
  /** Call when the menu closes. */
  reset: () => void
}

export function createMenuOpenFocus(): MenuOpenFocus {
  let first = false
  let last: HTMLElement | null = null
  return {
    first: () => {
      first = true
    },
    onOpenAutoFocus: (e, menu) => {
      e.preventDefault()
      if (!menu) return
      if (last && menu.contains(last)) last.focus({ preventScroll: true })
      else if (first) menuItems(menu)[0]?.focus({ preventScroll: true })
      else focusInitialMenuItem(menu)
    },
    onfocusin: (e) => {
      if (e.target instanceof HTMLElement) last = e.target
    },
    reset: () => {
      first = false
      last = null
    },
  }
}
