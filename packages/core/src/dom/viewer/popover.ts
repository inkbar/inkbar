/*
 * Panels anchored to an annotation's overlay element: the note thread, and any card an app
 * opens next to an annotation. A panel can also anchor to an element of the app's or a
 * plugin's own, such as a mark in a plugin layer.
 */
import { observeAnnotationElement } from '../annotation-element'
import { shouldKeepOpenOnAnnotation, type FocusReturn } from '../popover-focus'

import { h } from './dom'

/** Space between the anchor and the panel, and between the panel and the window edge. */
const GAP = 6
const MARGIN = 8
const TABBABLE = 'button, input, select, textarea, a[href], [tabindex]'

/** Options for `createPopover`. */
export interface PopoverOptions {
  /** The viewer root (`[data-ink-root]`): anchors are looked up and focus returns inside it. */
  root: HTMLElement
  /**
   * Attributes for the panel, such as `class`, `aria-label` or the app's own `data-*` keys.
   * `role` and `data-ink-popover` are always set by `createPopover`.
   */
  attrs: Record<string, string>
  /** Where focus goes when the panel hides: `createFocusReturn` over the same root. */
  focusReturn: FocusReturn
  /**
   * Called on Escape inside the panel or the viewer, and on a press outside the panel that will
   * not activate another annotation. Hide the panel (or clear the activation) here.
   */
  onDismiss(): void
}

/** A panel anchored to one annotation, or one element, at a time; see `createPopover`. */
export interface Popover {
  /** The panel element, on `<body>`. Fill it with the card's content. */
  readonly panel: HTMLElement
  /**
   * The anchored annotation's element (or the element passed to `showAt`), or null while it is
   * not in the DOM (page unmounted).
   */
  readonly anchor: HTMLElement | null
  /**
   * Anchors the panel to annotation `id`. The panel shows whenever that annotation's element
   * is in the DOM, and follows it when it is replaced.
   */
  show(id: string): void
  /**
   * Anchors the panel to `el`, for anchors that are not annotations (a plugin layer's mark).
   * The panel shows while `el` is under the viewer root and hides while it is not. On hide,
   * focus returns to `el` when it is still connected, else through `focusReturn`.
   */
  showAt(el: HTMLElement): void
  /** Hides the panel, then returns focus through `focusReturn`. */
  hide(): void
  /** Removes the panel and its listeners. */
  destroy(): void
}

/**
 * Positions `panel` (fixed) below the `anchor` rectangle, or above it when only that fits,
 * kept inside the window. For panels anchored to something other than an annotation.
 */
export function placePanel(panel: HTMLElement, anchor: DOMRect): void {
  const { innerWidth: vw, innerHeight: vh } = window
  // Fixed at the corner before measuring: a panel still in the flow is as wide as the body,
  // and one left where it was is squeezed by the window edge.
  panel.style.position = 'fixed'
  panel.style.left = '0px'
  panel.style.top = '0px'
  const w = panel.offsetWidth
  const ht = panel.offsetHeight
  let top = anchor.bottom + GAP
  if (top + ht > vh - MARGIN && anchor.top - GAP - ht >= MARGIN)
    top = anchor.top - GAP - ht
  top = Math.max(MARGIN, Math.min(top, vh - ht - MARGIN))
  const left = Math.max(MARGIN, Math.min(anchor.left, vw - w - MARGIN))
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
}

/**
 * Calls `onChange` with `el` while it is under `root` and null while it is not: once now, then
 * whenever that changes. Returns a function that stops observing.
 */
function observeElement(
  root: HTMLElement,
  el: HTMLElement,
  onChange: (el: HTMLElement | null) => void
): () => void {
  let last: HTMLElement | null | undefined
  const resolve = (): void => {
    const found = root.contains(el) ? el : null
    if (found === last) return
    last = found
    onChange(found)
  }
  resolve()
  const observer = new MutationObserver(resolve)
  observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}

/**
 * Creates a non-modal `role="dialog"` panel on `<body>`, marked `data-ink-popover` so the theme
 * gives it its tokens, that an app anchors to an annotation with `show(id)` (for instance on
 * `viewer.activated`), or to any element in the viewer with `showAt(el)`. The panel follows the annotation's element as pages mount and unmount:
 * it hides while the element is gone and comes back with it. Tab loops inside the panel, and
 * Escape or a press outside calls `onDismiss`. Call `destroy` when done.
 */
export function createPopover(opts: PopoverOptions): Popover {
  const { root, focusReturn } = opts
  const panel = h('div', {
    ...opts.attrs,
    role: 'dialog',
    'data-ink-popover': '',
    hidden: '',
  })
  document.body.append(panel)
  /** What the panel is anchored to: an annotation id, or an element from `showAt`. */
  let anchored: string | HTMLElement | null = null
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
  // Focus loops inside the panel.
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
      if (id === anchored) return
      stopObserving()
      anchored = id
      stopObserving = observeAnnotationElement(root, id, onAnchor)
    },
    showAt(el) {
      if (el === anchored) return
      stopObserving()
      anchored = el
      stopObserving = observeElement(root, el, onAnchor)
    },
    hide() {
      if (anchored === null) return
      stopObserving()
      stopObserving = () => undefined
      const element = typeof anchored === 'string' ? null : anchored
      anchored = null
      const back = anchor
      stranded = null
      onAnchor(null, true)
      // After the change that closed the popover has settled (a removed anchor is out of the
      // DOM, a cleared activation is cleared). A popover reopened meanwhile keeps focus where it
      // is.
      queueMicrotask(() => {
        if (anchored !== null || !panel.isConnected) return
        if (element?.isConnected) {
          // Focus already back in the viewer (a press on another mark) stays there.
          const active = document.activeElement
          if (!(active && active !== root && root.contains(active)))
            element.focus({ preventScroll: true })
          return
        }
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
