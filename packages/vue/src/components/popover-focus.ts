/**
 * Shared behaviour for popovers anchored to an overlay annotation element (there is no Reka
 * trigger, so Reka's own focus return has nothing to return to).
 */

/** A press on any annotation is an activation, not a dismissal: the popover follows it. */
export function keepOpenOnAnnotation(event: CustomEvent<{ originalEvent: Event }>): void {
  const target = event.detail.originalEvent.target
  if (target instanceof Element && target.closest('[data-annotation]'))
    event.preventDefault()
}

/**
 * Returns focus to the annotation the popover was anchored to, unless another popover took
 * over (activation moved on) or the annotation is gone.
 */
export function returnFocus(
  event: Event,
  anchor: HTMLElement | null,
  closing: boolean
): void {
  event.preventDefault()
  if (closing && anchor?.isConnected) anchor.focus({ preventScroll: true })
}
