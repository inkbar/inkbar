/*
 * A panel anchored to an annotation's overlay element, shared by the note thread and the
 * suggestion card. The overlay creates and removes those elements as pages mount and unmount,
 * so the panel follows the element by id: a replaced element re-anchors it, and while the
 * element is gone (its page scrolled out) the panel hides but stays logically open.
 */
import { observeAnnotationElement } from '../annotation-element'
import { shouldKeepOpenOnAnnotation, type FocusReturn } from '../popover-focus'

import { h } from './dom'

/** Space between the anchor and the panel, and between the panel and the window edge. */
const GAP = 6
const MARGIN = 8
const TABBABLE = 'button, input, select, textarea, a[href], [tabindex]'

export interface PopoverOptions {
  /** The viewer root: anchors are looked up and focus returns inside it. */
  root: HTMLElement
  attrs: Record<string, string>
  focusReturn: FocusReturn
  /** Escape, or a press outside that will not activate an annotation. */
  onDismiss(): void
}

export interface Popover {
  readonly panel: HTMLElement
  /** The anchor element, or null while it is not in the DOM. */
  readonly anchor: HTMLElement | null
  /** Anchors to annotation `id`. The panel shows whenever its element is in the DOM. */
  show(id: string): void
  /** Hides the panel and returns focus the way the bindings do. */
  hide(): void
  destroy(): void
}

/**
 * Fixed-positions `panel` below `anchor` (above it when only that fits), clamped to the
 * window. Shared by the annotation popovers and the trigger-anchored menus.
 */
export function placePanel(panel: HTMLElement, anchor: DOMRect): void {
  const { innerWidth: vw, innerHeight: vh } = window
  const w = panel.offsetWidth
  const ht = panel.offsetHeight
  let top = anchor.bottom + GAP
  if (top + ht > vh - MARGIN && anchor.top - GAP - ht >= MARGIN)
    top = anchor.top - GAP - ht
  top = Math.max(MARGIN, Math.min(top, vh - ht - MARGIN))
  const left = Math.max(MARGIN, Math.min(anchor.left, vw - w - MARGIN))
  panel.style.position = 'fixed'
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
}

export function createPopover(opts: PopoverOptions): Popover {
  const { root, focusReturn } = opts
  const panel = h('div', { ...opts.attrs, role: 'dialog', hidden: '' })
  document.body.append(panel)
  let anchoredId: string | null = null
  let anchor: HTMLElement | null = null
  let stopObserving: () => void = () => undefined
  /** The element that had focus in the panel when the anchor went away. */
  let stranded: HTMLElement | null = null

  const place = (): void => {
    if (!anchor || panel.hidden) return
    placePanel(panel, anchor.getBoundingClientRect())
  }

  // The anchor changes size on zoom; the panel when its content changes.
  const resizes = new ResizeObserver(place)
  resizes.observe(panel)

  const onAnchor = (el: HTMLElement | null, closing = false): void => {
    if (anchor) resizes.unobserve(anchor)
    anchor = el
    if (!el) {
      const active = document.activeElement
      if (
        !closing &&
        !panel.hidden &&
        active instanceof HTMLElement &&
        panel.contains(active)
      ) {
        // Hiding the panel would drop focus to the body: keep the keyboard in the viewer.
        const scroll = root.querySelector<HTMLElement>('[data-ink-scroll]')
        if (scroll) {
          stranded = active
          scroll.focus({ preventScroll: true })
        }
      }
      panel.hidden = true
      return
    }
    resizes.observe(el)
    const wasHidden = panel.hidden
    panel.hidden = false
    place()
    if (wasHidden && stranded) {
      const back = stranded
      stranded = null
      const scroll = root.querySelector<HTMLElement>('[data-ink-scroll]')
      if (panel.contains(back) && document.activeElement === scroll)
        back.focus({ preventScroll: true })
    }
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || panel.hidden || e.defaultPrevented) return
    // An Escape meant for a host's own dialog elsewhere on the page is not ours.
    const target = e.target
    if (!(target instanceof Node) || !(panel.contains(target) || root.contains(target)))
      return
    e.preventDefault()
    opts.onDismiss()
  }
  const onPress = (e: PointerEvent): void => {
    if (panel.hidden || panel.contains(e.target as Node)) return
    // A press that will activate an annotation hands over to it instead of closing.
    if (shouldKeepOpenOnAnnotation(e.target)) return
    opts.onDismiss()
  }
  // Focus loops inside the panel, as the bindings' non-modal popovers do.
  const onTab = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return
    const tabbable = [...panel.querySelectorAll<HTMLElement>(TABBABLE)].filter(
      (el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0
    )
    const first = tabbable[0]
    const last = tabbable.at(-1)
    if (!first || !last) return
    const active = document.activeElement
    if (e.shiftKey ? active !== first : active !== last) return
    e.preventDefault()
    ;(e.shiftKey ? last : first).focus()
  }
  panel.addEventListener('keydown', onTab)
  document.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', onPress, true)
  // The viewer's scroll element and any scrolling ancestor in the host page.
  document.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)

  return {
    panel,
    get anchor() {
      return anchor
    },
    show(id) {
      if (id === anchoredId) return
      stopObserving()
      anchoredId = id
      stopObserving = observeAnnotationElement(root, id, onAnchor)
    },
    hide() {
      if (anchoredId === null) return
      stopObserving()
      stopObserving = () => undefined
      anchoredId = null
      const back = anchor
      stranded = null
      onAnchor(null, true)
      // After the change that closed the popover has settled (a removed anchor is out of the
      // DOM, a cleared activation is cleared), as the bindings' close-auto-focus runs after
      // their render. A popover reopened meanwhile keeps focus where it is.
      queueMicrotask(() => {
        if (anchoredId !== null || !panel.isConnected) return
        focusReturn.onCloseAutoFocus(
          new Event('closeautofocus', { cancelable: true }),
          back
        )
      })
    },
    destroy() {
      stopObserving()
      resizes.disconnect()
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPress, true)
      panel.removeEventListener('keydown', onTab)
      document.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      panel.remove()
    },
  }
}
