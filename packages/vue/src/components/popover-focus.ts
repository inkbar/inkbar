/**
 * Shared behaviour for popovers anchored to an overlay annotation element (there is no Reka
 * trigger, so Reka's own focus return has nothing to return to).
 */
import type { InkContext } from '../context'

/** A press on any annotation is an activation, not a dismissal: the popover follows it. */
export function keepOpenOnAnnotation(event: CustomEvent<{ originalEvent: Event }>): void {
  const target = event.detail.originalEvent.target
  if (target instanceof Element && target.closest('[data-annotation]'))
    event.preventDefault()
}

export interface FocusReturn {
  /**
   * Call just before removing the anchor's annotation: remembers where focus goes instead,
   * the next annotation on the page in reading order (the next one matching `prefer`
   * first), else the previous one, else the scroll element.
   */
  beforeRemove(anchor: HTMLElement | null, prefer?: string): void
  /** The popover's `close-auto-focus` handler. */
  onCloseAutoFocus(event: Event, anchor: HTMLElement | null): void
}

export function useFocusReturn(ctx: InkContext): FocusReturn {
  let fallbacks: HTMLElement[] = []

  return {
    beforeRemove(anchor, prefer) {
      fallbacks = []
      // The overlay keeps its elements in reading order, so DOM order is reading order.
      const siblings = anchor?.parentElement
        ? [...anchor.parentElement.children].filter(
            (el): el is HTMLElement =>
              el instanceof HTMLElement && el.hasAttribute('data-annotation')
          )
        : []
      const i = anchor ? siblings.indexOf(anchor) : -1
      if (i >= 0) {
        const after = siblings.slice(i + 1)
        const preferred = prefer ? after.filter((el) => el.matches(prefer)) : []
        fallbacks.push(...preferred, ...after, ...siblings.slice(0, i).reverse())
      }
    },
    onCloseAutoFocus(event, anchor) {
      event.preventDefault()
      const plan = fallbacks
      fallbacks = []
      // Activation moved to another annotation: its popover takes focus.
      if (ctx.activated.value !== null) return
      const root = ctx.rootEl.value
      // Reka can report the close more than once; focus already returned to the document stays.
      const active = root?.ownerDocument.activeElement
      if (active && active !== root && root?.contains(active)) return
      const scroll = root?.querySelector<HTMLElement>('[data-ink-scroll]')
      const target = [anchor, ...plan, scroll].find((el) => el?.isConnected)
      target?.focus({ preventScroll: true })
    },
  }
}
