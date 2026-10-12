/**
 * Shared behaviour for popovers anchored to an overlay annotation element (there is no Reka
 * trigger, so Reka's own focus return has nothing to return to).
 */
import type { InkContext } from '../context'

/**
 * A press that will activate an annotation is not a dismissal: the popover follows the
 * activation. This mirrors the overlay's rule: a press on the annotation element or on its
 * drawn shape activates; a press on a custom element's slot content belongs to that content,
 * does not activate, and so dismisses like any other press outside.
 */
export function keepOpenOnAnnotation(event: CustomEvent<{ originalEvent: Event }>): void {
  const target = event.detail.originalEvent.target
  if (!(target instanceof Element)) return
  const annotation = target.closest('[data-annotation]')
  if (!annotation) return
  if (target === annotation || !annotation.hasAttribute('data-custom'))
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
  /** Set by `beforeRemove`: the close comes from removing the anchor's annotation. */
  let removing = false

  const elementFor = (id: string): HTMLElement | null =>
    ctx.rootEl.value?.querySelector<HTMLElement>(
      `[data-annotation="${CSS.escape(id)}"]`
    ) ?? null

  return {
    beforeRemove(anchor, prefer) {
      fallbacks = []
      removing = true
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
      const removed = removing
      fallbacks = []
      removing = false
      const root = ctx.rootEl.value
      if (!root) return
      // Activation moved to another annotation that is on screen: its popover takes focus. An
      // id whose element is gone (the host removed it) does not count.
      const activated = ctx.activated.value
      if (activated !== null && elementFor(activated)) return
      // Reka can report the close more than once; focus already returned to the document stays.
      const active = root.ownerDocument.activeElement
      if (active && active !== root && root.contains(active)) return
      const scroll = root.querySelector<HTMLElement>('[data-ink-scroll]')
      // After a removal the anchor may still be connected (a controlled host has not applied
      // the change yet), but it is on its way out: go straight to what follows it.
      const candidates = removed ? [...plan, scroll] : [anchor, ...plan, scroll]
      candidates.find((el) => el?.isConnected)?.focus({ preventScroll: true })
    },
  }
}
