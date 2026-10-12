// Inline styles here are structural or geometric only: the container is
// `position:absolute; inset:0; pointer-events:none` so it covers the page without eating
// events, and each annotation element is `position:absolute` with `left/top/width/height`
// from `annotationBox` (stroked paths padded once by their stroke), or from
// `PageTransform.toCssRect(a.rect)` for custom elements. Hit-testing
// follows the drawn shape, not the box: elements are `pointer-events:none` and their shapes
// opt back in (overlay-render.ts), so a press beside a shape still reaches the text layer.
// Resize handles (`.ink-handle[data-handle]`) are 8px `position:absolute;
// pointer-events:auto` boxes on the element's corners; their look is the theme's.
// Custom elements are the exception and stay `pointer-events:auto`: the host draws them and
// only it knows their shape. Every visual (colour, opacity, stroke, fill) is an SVG
// attribute or a theme hook.
import { hasRectGeometry, resizedRect, translated } from '../model/annotations/edit'
import { confidenceBucket, type Annotation } from '../model/annotations/types'

import { annotationBox, renderAnnotationContent, renderHitArea } from './overlay-render'

import type { PageTransform } from './transform'
import type { AnnotationStore } from '../model/annotations/store'

export interface OverlayOptions {
  host: HTMLElement
  /** 0-based page index this overlay shows. */
  page: number
  store: AnnotationStore
  transform: PageTransform
  /** Called when an annotation is clicked, or activated with Enter or Space. */
  onActivate?(id: string): void
  /** Return true to render only the positioned shell; the host (e.g. a Vue slot) fills it. */
  isCustom?(annotation: Annotation): boolean
}

export interface Overlay {
  readonly element: HTMLElement
  /** Repositions every element and redraws content for a new zoom or rotation. */
  update(transform: PageTransform): void
  elementFor(id: string): HTMLElement | undefined
  destroy(): void
}

type State = 'idle' | 'hover' | 'selected'

/** Resize handles, by the CSS corner they sit on. */
const HANDLES = ['nw', 'ne', 'sw', 'se'] as const
/** Side of a resize handle, CSS px. */
const HANDLE_PX = 8

/** Arrow keys as user-space unit steps (y grows upwards). */
const ARROW_STEPS: Record<string, { x: number; y: number }> = {
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
}

const LABELS: Record<Annotation['type'], string> = {
  highlight: 'Highlight',
  underline: 'Underline',
  strikeout: 'Strikeout',
  squiggly: 'Squiggly underline',
  note: 'Note',
  freeText: 'Text box',
  square: 'Rectangle',
  circle: 'Ellipse',
  line: 'Line',
  polyline: 'Polyline',
  polygon: 'Polygon',
  ink: 'Drawing',
  redact: 'Redaction',
}

/** The `data-confidence` bucket for a suggested redaction; undefined for everything else. */
export function confidenceAttr(a: Annotation): 'low' | 'medium' | 'high' | undefined {
  return a.type === 'redact' && a.suggestion
    ? confidenceBucket(a.suggestion.confidence)
    : undefined
}

function ariaLabel(a: Annotation): string {
  const base =
    a.type === 'redact' && a.origin === 'suggested'
      ? 'Suggested redaction'
      : LABELS[a.type]
  return a.author ? `${base} by ${a.author}` : base
}

/** Reading order in user space: top edge first (y grows upwards), then left edge. */
function readingOrder(a: Annotation, b: Annotation): number {
  return b.rect.y + b.rect.height - (a.rect.y + a.rect.height) || a.rect.x - b.rect.x
}

function setFlag(node: HTMLElement, key: string, on: boolean): void {
  if (on) node.dataset[key] = ''
  else delete node.dataset[key]
}

function setData(node: HTMLElement, key: string, value: string | undefined): void {
  if (value === undefined) delete node.dataset[key]
  else node.dataset[key] = value
}

export function createOverlay(opts: OverlayOptions): Overlay {
  const { store, page } = opts
  const doc = opts.host.ownerDocument
  let transform = opts.transform
  const root = doc.createElement('div')
  root.className = 'ink-overlay'
  root.dataset.inkOverlay = ''
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
  opts.host.append(root)

  const elements = new Map<string, HTMLElement>()
  /** What each element's content was last drawn from; absent when it has none of ours. */
  const drawn = new Map<string, { a: Annotation; t: PageTransform }>()
  const hovered = new Set<string>()
  let order: string[] = []
  let destroyed = false

  function stateOf(id: string, selected: ReadonlySet<string>): State {
    if (selected.has(id)) return 'selected'
    return hovered.has(id) ? 'hover' : 'idle'
  }

  function applyState(node: HTMLElement, id: string): void {
    const selected = new Set(store.selection.get())
    const anyHere = order.some((x) => selected.has(x))
    const state = stateOf(id, selected)
    node.dataset.state = state
    node.setAttribute('aria-pressed', String(state === 'selected'))
    node.tabIndex = !anyHere || state === 'selected' ? 0 : -1
    const a = store.get(id)
    syncHandles(
      node,
      state === 'selected' && a !== undefined && !a.locked && hasRectGeometry(a)
    )
  }

  /**
   * Corner handles for a selected, unlocked rect-shaped annotation. The select tool drags them
   * (`data-handle` names the CSS corner); in other tools a press on one is a press on the
   * annotation. Themes show them only while the select tool is active.
   */
  function syncHandles(node: HTMLElement, want: boolean): void {
    const existing = node.querySelectorAll(':scope > [data-handle]')
    if (!want) {
      existing.forEach((h) => h.remove())
      return
    }
    if (existing.length === HANDLES.length) return
    existing.forEach((h) => h.remove())
    for (const corner of HANDLES) {
      const h = doc.createElement('div')
      h.className = 'ink-handle'
      h.dataset.handle = corner
      h.setAttribute('aria-hidden', 'true')
      const off = `${-HANDLE_PX / 2}px`
      h.style.cssText =
        `position:absolute;width:${HANDLE_PX}px;height:${HANDLE_PX}px;pointer-events:auto;` +
        `${corner[0] === 'n' ? 'top' : 'bottom'}:${off};` +
        `${corner[1] === 'w' ? 'left' : 'right'}:${off};`
      node.append(h)
    }
  }

  function applyAttributes(node: HTMLElement, a: Annotation): void {
    node.dataset.type = a.type
    node.dataset.source = a.source
    setFlag(node, 'locked', a.locked === true)
    setData(node, 'origin', a.type === 'redact' ? a.origin : undefined)
    setData(node, 'confidence', confidenceAttr(a))
    node.setAttribute('aria-label', ariaLabel(a))
  }

  function applyGeometry(node: HTMLElement, a: Annotation): void {
    // Custom elements hold host content laid out against the annotation's own rect.
    const box =
      opts.isCustom?.(a) === true
        ? transform.toCssRect(a.rect)
        : annotationBox(a, transform)
    node.style.left = `${box.left}px`
    node.style.top = `${box.top}px`
    node.style.width = `${box.width}px`
    node.style.height = `${box.height}px`
  }

  function applyContent(node: HTMLElement, a: Annotation): void {
    const custom = opts.isCustom?.(a) === true
    setFlag(node, 'custom', custom)
    node.style.pointerEvents = custom ? 'auto' : 'none'
    // Custom elements are the host's to fill: draw nothing.
    if (custom) {
      if (drawn.delete(a.id)) node.replaceChildren()
      return
    }
    const last = drawn.get(a.id)
    if (last?.a === a && last.t === transform) return
    // Embedded annotations are already painted on the canvas by PDF.js, so they get only an
    // invisible hit area.
    if (a.source === 'pdf') renderHitArea(node, a, transform)
    else renderAnnotationContent(node, a, transform)
    drawn.set(a.id, { a, t: transform })
  }

  function activate(id: string): void {
    store.select([id])
    opts.onActivate?.(id)
  }

  function focusAt(index: number): void {
    const id = order[Math.max(0, Math.min(order.length - 1, index))]
    if (id !== undefined) elements.get(id)?.focus()
  }

  /**
   * `Shift+Arrow` moves the annotation 1 pt in user space (`Shift+Alt+Arrow` 10 pt; up is +y).
   * `Ctrl+Shift+Arrow` or `Meta+Shift+Arrow` resizes a rect-shaped one by 1 pt: Right and Down
   * grow it, Left and Up shrink it, keeping its top-left corner. Locked items ignore both.
   * Returns true when the key was one of these chords.
   */
  function onEditKey(e: KeyboardEvent, id: string): boolean {
    const step = ARROW_STEPS[e.key]
    if (!step || !e.shiftKey) return false
    e.preventDefault()
    const a = store.get(id)
    if (!a || a.locked) return true
    if (e.ctrlKey || e.metaKey) {
      if (hasRectGeometry(a))
        store.update(id, { rect: resizedRect(a.rect, step.x, -step.y) })
      return true
    }
    const by = e.altKey ? 10 : 1
    store.update(id, translated(a, step.x * by, step.y * by))
    return true
  }

  function onKey(e: KeyboardEvent, id: string): void {
    if (onEditKey(e, id)) return
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        activate(id)
        break
      case 'Delete':
      case 'Backspace': {
        // The overlay owns deletion from a focused annotation: it removes that one only, never
        // the rest of the selection. `preventDefault` tells the select tool to stand down.
        e.preventDefault()
        const a = store.get(id)
        if (a && !a.locked) store.remove(id)
        break
      }
      case 'Escape':
        e.preventDefault()
        store.select([])
        break
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        focusAt(order.indexOf(id) + (e.key === 'ArrowDown' ? 1 : -1))
        break
      default:
    }
  }

  function create(id: string): HTMLElement {
    const node = doc.createElement('div')
    node.className = 'ink-annotation'
    node.dataset.annotation = id
    node.setAttribute('role', 'button')
    node.style.position = 'absolute'
    node.addEventListener('pointerenter', () => {
      hovered.add(id)
      applyState(node, id)
    })
    node.addEventListener('pointerleave', () => {
      hovered.delete(id)
      applyState(node, id)
    })
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      // A press on a custom element's own content (a host's button, say) is that content's:
      // no selection, and it bubbles on to the host's delegated handlers.
      if (
        e.target !== node &&
        node.hasAttribute('data-custom') &&
        !(e.target instanceof Element && e.target.closest('[data-handle]'))
      )
        return
      // A tool listening on the page root must not start a drag from this press.
      e.stopPropagation()
      activate(id)
    })
    node.addEventListener('keydown', (e) => {
      // Keys typed in descendants (a custom element's buttons and inputs) are theirs.
      if (e.target !== node) return
      onKey(e, id)
    })
    return node
  }

  function render(): void {
    if (destroyed) return
    const current = store.byPage(page).sort(readingOrder)
    const ids = new Set(current.map((a) => a.id))
    const active = doc.activeElement
    let focusId = [...elements].find(([, n]) => n === active)?.[0]
    /** The focused element is going away with nothing on this page to take over. */
    let focusRoot = false

    if (focusId !== undefined && !ids.has(focusId)) {
      // The focused element is going away: hand focus to the next survivor, else the previous.
      const i = order.indexOf(focusId)
      focusId =
        order.slice(i + 1).find((x) => ids.has(x)) ??
        order
          .slice(0, i)
          .reverse()
          .find((x) => ids.has(x))
      focusRoot = focusId === undefined
    }
    for (const [id, node] of elements) {
      if (ids.has(id)) continue
      node.remove()
      elements.delete(id)
      drawn.delete(id)
      hovered.delete(id)
    }

    order = current.map((a) => a.id)
    for (const a of current) {
      let node = elements.get(a.id)
      if (!node) {
        node = create(a.id)
        elements.set(a.id, node)
      }
      applyAttributes(node, a)
      applyGeometry(node, a)
      applyContent(node, a)
      applyState(node, a.id)
    }

    // DOM order is tab order: keep it in reading order. Moving nodes blurs them, so only
    // re-append when the order actually changed.
    const inDom = [...root.children]
    if (
      inDom.length !== order.length ||
      order.some((id, i) => inDom[i] !== elements.get(id))
    ) {
      for (const id of order) root.append(elements.get(id)!)
    }
    if (focusId !== undefined) {
      const target = elements.get(focusId)
      if (target && doc.activeElement !== target) target.focus({ preventScroll: true })
    } else if (focusRoot) {
      // Last one on the page: back to the scroll element (as the popovers do), not <body>.
      opts.host
        .closest<HTMLElement>('[data-ink-viewport]')
        ?.focus({ preventScroll: true })
    }
  }

  const offList = store.list.subscribe(render)
  const offSelection = store.selection.subscribe(() => {
    for (const [id, node] of elements) applyState(node, id)
  })
  render()

  return {
    element: root,
    update(next) {
      transform = next
      render()
    },
    elementFor: (id) => elements.get(id),
    destroy() {
      if (destroyed) return
      destroyed = true
      offList()
      offSelection()
      root.remove()
      elements.clear()
      drawn.clear()
      hovered.clear()
      order = []
    },
  }
}
