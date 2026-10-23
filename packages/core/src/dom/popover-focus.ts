/*
 * Shared behaviour for popovers anchored to an overlay annotation element. There is no popover
 * trigger, so the primitive library's own focus return has nothing to return to.
 */
import { annotationElementFor } from './annotation-element'

/**
 * A press that will activate an annotation is not a dismissal: the popover follows the
 * activation. Mirrors the overlay's rule: a press on the annotation element or on its drawn
 * shape activates; a press on a custom element's own content belongs to that content.
 */
export function shouldKeepOpenOnAnnotation(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const annotation = target.closest('[data-annotation]')
  if (!annotation) return false
  return target === annotation || !annotation.hasAttribute('data-custom')
}

export interface FocusReturnOptions {
  root: () => HTMLElement | null
  /** The activated annotation id when the popover closes. */
  activated: () => string | null
}

export interface FocusReturn {
  /**
   * Call just before removing the anchor's annotation: remembers where focus goes instead,
   * the next annotation on the page in reading order (the next one matching `prefer`
   * first), else the previous one, else the scroll element.
   */
  beforeRemove(anchor: HTMLElement | null, prefer?: string): void
  /** The popover's close-auto-focus handler. Prevents the default and places focus itself. */
  onCloseAutoFocus(event: Event, anchor: HTMLElement | null): void
}

export function createFocusReturn(opts: FocusReturnOptions): FocusReturn {
  let fallbacks: HTMLElement[] = []
  /** Set by `beforeRemove`: the close comes from removing the anchor's annotation. */
  let removing = false

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
      const root = opts.root()
      if (!root) return
      // Activation moved to another annotation that is on screen: its popover takes focus. An
      // id whose element is gone (the host removed it) does not count.
      const activated = opts.activated()
      if (activated !== null && annotationElementFor(root, activated)) return
      // The close can be reported more than once; focus already returned to the document stays.
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

/**
 * Calls `onDetach` once when `el` leaves its document for any reason: its page unmounted, its
 * layer rebuilt, or an ancestor removed. Already detached, it calls on the next microtask.
 * Returns the stop function.
 */
export function watchDetached(el: Element, onDetach: () => void): () => void {
  let done = false
  const fire = (): void => {
    if (done || el.isConnected) return
    done = true
    observer.disconnect()
    onDetach()
  }
  const observer = new MutationObserver(fire)
  observer.observe(el.ownerDocument, { childList: true, subtree: true })
  if (!el.isConnected) queueMicrotask(fire)
  return () => {
    done = true
    observer.disconnect()
  }
}
