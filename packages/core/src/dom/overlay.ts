// Inline styles here are structural or geometric only: the container is
// `position:absolute; inset:0; pointer-events:none` so it covers the page without eating
// events, and each annotation element is `position:absolute` with `left/top/width/height`
// from `PageTransform.toCssRect`. Hit-testing follows the drawn shape, not the box: elements
// are `pointer-events:none` and their shapes opt back in (overlay-render.ts), so a press
// beside a shape still reaches the text layer. Custom elements are the exception and stay
// `pointer-events:auto`: the host draws them and only it knows their shape. Every visual
// (colour, opacity, stroke, fill) is an SVG attribute or a theme hook.
import { confidenceBucket, type Annotation } from '../model/annotations/types'

import { renderAnnotationContent, renderHitArea } from './overlay-render'

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
    const box = transform.toCssRect(a.rect)
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

  function onKey(e: KeyboardEvent, id: string): void {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        activate(id)
        break
      case 'Delete':
      case 'Backspace': {
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
      // A tool listening on the page root must not start a drag from this press.
      e.stopPropagation()
      // A press on a custom element's own content (a host's button, say) is that content's.
      if (e.target !== node && node.hasAttribute('data-custom')) return
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

    if (focusId !== undefined && !ids.has(focusId)) {
      // The focused element is going away: hand focus to the next survivor, else the previous.
      const i = order.indexOf(focusId)
      focusId =
        order.slice(i + 1).find((x) => ids.has(x)) ??
        order
          .slice(0, i)
          .reverse()
          .find((x) => ids.has(x))
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
