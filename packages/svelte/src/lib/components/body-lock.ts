import type { Attachment } from 'svelte/attachments'

/**
 * The page lock a modal holds while it is in the DOM: the body stops scrolling and stops taking
 * pointer events, so only the modal (which sets `pointer-events: auto` on itself and its
 * overlay) can be clicked. Attach it to the modal's content element.
 *
 * bits-ui's own lock (Dialog.Content `preventScroll`) releases on a timer after the content
 * unmounts, so for a few frames after a dialog closes the page ignores clicks, and a click
 * straight after Save is lost. This one releases in the same teardown that removes the content,
 * as the Vue and React bindings do. Dialogs that use it pass `preventScroll={false}`.
 *
 * Locks are counted, so a dialog opened from another keeps the page locked until the last one
 * closes. The body's inline styles from before the first lock come back after the last.
 */
let holders = 0
let saved: { overflow: string; paddingRight: string; pointerEvents: string } | null = null

export const lockBody: Attachment<HTMLElement> = () => {
  const body = document.body
  if (holders++ === 0) {
    const { style } = body
    saved = {
      overflow: style.overflow,
      paddingRight: style.paddingRight,
      pointerEvents: style.pointerEvents,
    }
    // Hiding the scrollbar would widen the page; pad by its width so nothing shifts.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    if (scrollbar > 0) {
      const padding = Number.parseFloat(getComputedStyle(body).paddingRight) || 0
      style.paddingRight = `${padding + scrollbar}px`
    }
    style.overflow = 'hidden'
    style.pointerEvents = 'none'
  }
  return () => {
    if (--holders > 0 || !saved) return
    const { style } = body
    style.overflow = saved.overflow
    style.paddingRight = saved.paddingRight
    style.pointerEvents = saved.pointerEvents
    saved = null
  }
}
