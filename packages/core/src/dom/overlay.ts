// Inline styles here are structural or geometric only: the container is
// `position:absolute; inset:0; pointer-events:none` so it covers the page without eating
// events, and each annotation element is `position:absolute` with `left/top/width/height`
// from `annotationBox` (stroked paths padded once by their stroke), or from
// `PageTransform.toCssRect(a.rect)` for custom elements. Hit-testing
// follows the drawn shape, not the box: elements are `pointer-events:none` and their shapes
// opt back in (overlay-render.ts), so a press beside a shape still reaches the text layer.
// Edit handles (`.ink-handle[data-handle]`) are 8px `position:absolute;
// pointer-events:auto` boxes on the element's corners or a line's ends, placed with
// left/top; their look is the theme's.
// Custom elements are the exception and stay `pointer-events:auto`: the host draws them and
// only it knows their shape. Every visual (colour, opacity, stroke, fill) is an SVG
// attribute or a theme hook.
import { freeTextBox } from '../model/annotations/callout'
import {
  hasCallout,
  hasCornerHandles,
  hasRectGeometry,
  isTextMarkup,
  keepsAspect,
  resizedBox,
  resizedRect,
  translated,
} from '../model/annotations/edit'
import { withoutReplies } from '../model/annotations/threads'
import {
  confidenceBucket,
  type Annotation,
  type MaskAnnotation,
} from '../model/annotations/types'

import { canEditFreeText, editFreeTextIn, editorFor } from './freetext-editor'
import { createLoupeLayer } from './loupe-layer'
import { createMaskLayer } from './mask-layer'
import {
  annotationBox,
  freeTextLocalBox,
  hasComment,
  renderAnnotationContent,
  renderHitArea,
  syncHandles,
  type HandleSpec,
} from './overlay-render'

import type { PageTransform } from './transform'
import type { AnnotationStore } from '../model/annotations/store'
import type { InkDocument } from '../model/document'
import type { Point } from '../model/geometry'

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
  /**
   * The document the page belongs to. Loupes magnify its page content; without it they show
   * only their rim.
   */
  document?: InkDocument
  /** Fixed device pixel ratio for loupes; `window.devicePixelRatio` when omitted. */
  devicePixelRatio?: number
}

export interface Overlay {
  readonly element: HTMLElement
  /** Repositions every element and redraws content for a new zoom or rotation. */
  update(transform: PageTransform): void
  elementFor(id: string): HTMLElement | undefined
  destroy(): void
}

type State = 'idle' | 'hover' | 'selected'

/** A text position: a node and an offset in it. */
interface Caret {
  node: Node
  offset: number
}

/** Pointer travel, CSS px, within which a press on text markup is still a click. */
const CLICK_SLOP = 3
/** Longest press, ms, that still counts as a click on text markup. */
const CLICK_MS = 500

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
  strikeout: 'Strikethrough',
  squiggly: 'Squiggly underline',
  text: 'Note',
  freetext: 'Text box',
  square: 'Rectangle',
  circle: 'Ellipse',
  line: 'Line',
  polyline: 'Polyline',
  polygon: 'Polygon',
  ink: 'Drawing',
  stamp: 'Stamp',
  loupe: 'Loupe',
  mask: 'Mask',
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
      : a.subject === 'Signature' && (a.type === 'ink' || a.type === 'stamp')
        ? 'Signature'
        : LABELS[a.type]
  const named = hasComment(a) ? `${base} with comment` : base
  return a.author ? `${named} by ${a.author}` : named
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
  const masks = createMaskLayer(opts.host, root)
  const loupes = opts.document
    ? createLoupeLayer({
        document: opts.document,
        ...(opts.devicePixelRatio === undefined
          ? {}
          : { devicePixelRatio: opts.devicePixelRatio }),
      })
    : undefined
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
      a && !a.locked && state === 'selected' && selectToolActive()
        ? handleSpec(node, a)
        : { kind: 'none' }
    )
  }

  /**
   * Line ends for a line, corners for what a corner drag resizes (a free text's on its text
   * box), plus the tip for a callout, else none.
   */
  function handleSpec(node: HTMLElement, a: Annotation): HandleSpec {
    const left = parseFloat(node.style.left) || 0
    const top = parseFloat(node.style.top) || 0
    if (a.type === 'line') {
      const local = (p: Point): Point => {
        const c = transform.toCss(p)
        return { x: c.x - left, y: c.y - top }
      }
      return { kind: 'ends', start: local(a.start), end: local(a.end) }
    }
    if (!hasCornerHandles(a)) return { kind: 'none' }
    const corners =
      a.type === 'freetext'
        ? { kind: 'corners' as const, ...freeTextLocalBox(a, transform) }
        : {
            kind: 'corners' as const,
            width: parseFloat(node.style.width) || 0,
            height: parseFloat(node.style.height) || 0,
          }
    if (!hasCallout(a)) return corners
    const tip = transform.toCss(a.callout[0])
    return { ...corners, tail: { x: tip.x - left, y: tip.y - top } }
  }

  /**
   * True while the tool controller marks the tool root (an ancestor) with a select tool,
   * `data-ink-tool="select"` or `"select-text"`.
   */
  function selectToolActive(): boolean {
    const tool = opts.host.closest('[data-ink-tool]')?.getAttribute('data-ink-tool')
    return tool === 'select' || tool === 'select-text'
  }
  // Re-sync handles on a tool switch. The controller's root is normally the viewport
  // container; pages can mount before the controller marks it, so fall back to that.
  const toolRoot =
    opts.host.closest('[data-ink-tool]') ?? opts.host.closest('[data-ink-viewport]')
  const Observer = doc.defaultView?.MutationObserver
  let toolObserver: MutationObserver | undefined
  if (toolRoot && Observer) {
    toolObserver = new Observer(() => {
      if (destroyed) return
      for (const [id, node] of elements) applyState(node, id)
    })
    toolObserver.observe(toolRoot, {
      attributes: true,
      attributeFilter: ['data-ink-tool'],
    })
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
      loupes?.drop(a.id)
      if (drawn.delete(a.id)) node.replaceChildren()
      return
    }
    const last = drawn.get(a.id)
    if (last?.a === a && last.t === transform) return
    // Embedded annotations are already painted on the canvas by PDF.js, so they get only an
    // invisible hit area.
    if (a.source === 'pdf') renderHitArea(node, a, transform)
    else renderAnnotationContent(node, a, transform)
    if (a.type === 'loupe') loupes?.attach(node, a, transform)
    drawn.set(a.id, { a, t: transform })
  }

  /**
   * Opens the in-place editor on a free-text box this overlay draws. False when it cannot be
   * edited: not free text, locked, embedded or host-rendered.
   */
  function edit(id: string): boolean {
    const a = store.get(id)
    const node = elements.get(id)
    if (!node || !canEditFreeText(a, node) || opts.isCustom?.(a) === true) return false
    if (editorFor(node)) return true
    return editFreeTextIn(store, node, id, transform) !== undefined
  }

  /** Commits every open editor: before a redraw that would lose it, or teardown. */
  function closeEditors(): void {
    for (const node of elements.values()) editorFor(node)?.close(true)
  }

  function activate(id: string): void {
    store.select([id])
    opts.onActivate?.(id)
  }

  /** The live press on text markup, until its release or cancel. */
  let markupPress: (() => void) | undefined

  /**
   * A press on text markup does nothing yet. A release within `CLICK_SLOP` px and `CLICK_MS`
   * of it selects and activates the markup (with `Shift`, toggles it in the selection); a
   * longer drag selects the text under it instead, from the press point to the pointer, as a
   * drag on the bare text would. Rectangle select claims markup presses before they get here.
   */
  function pressMarkup(e: PointerEvent, id: string): void {
    // The browser's own selection would start inside the overlay, not the text: drive it here.
    e.preventDefault()
    markupPress?.()
    const view = doc.defaultView
    if (!view) return
    const { clientX: x0, clientY: y0, pointerId, timeStamp: t0 } = e
    let anchor: Caret | undefined
    let dragging = false
    const mine = (ev: PointerEvent): boolean => ev.pointerId === pointerId
    const onMove = (ev: PointerEvent): void => {
      if (!mine(ev)) return
      if (ev.buttons === 0) return end()
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) <= CLICK_SLOP) return
      dragging = true
      anchor ??= caretAt(x0, y0)
      const focus = caretAt(ev.clientX, ev.clientY)
      if (anchor && focus)
        doc
          .getSelection()
          ?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
    }
    const onUp = (ev: PointerEvent): void => {
      if (!mine(ev) || ev.button !== 0) return
      end()
      if (
        !dragging &&
        !destroyed &&
        Math.hypot(ev.clientX - x0, ev.clientY - y0) <= CLICK_SLOP &&
        ev.timeStamp - t0 <= CLICK_MS &&
        store.get(id)
      ) {
        if (!(e.shiftKey || ev.shiftKey)) return activate(id)
        // Shift-click adds the markup to the selection, or takes it out.
        const selected = store.selection.get()
        store.select(
          selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
        )
      }
    }
    const onCancel = (ev: PointerEvent): void => {
      if (mine(ev)) end()
    }
    const end = (): void => {
      view.removeEventListener('pointermove', onMove, true)
      view.removeEventListener('pointerup', onUp, true)
      view.removeEventListener('pointercancel', onCancel, true)
      if (markupPress === end) markupPress = undefined
    }
    // Capture on the window: the release still arrives when a tool captured the pointer or a
    // handler on the way stops it.
    view.addEventListener('pointermove', onMove, true)
    view.addEventListener('pointerup', onUp, true)
    view.addEventListener('pointercancel', onCancel, true)
    markupPress = end
  }

  /**
   * The text position under a client point on this page's text layer, looked up with the
   * overlay hidden so the markup on top does not answer instead.
   */
  function caretAt(x: number, y: number): Caret | undefined {
    const visibility = root.style.visibility
    root.style.visibility = 'hidden'
    let caret: Caret | undefined
    try {
      if (typeof doc.caretPositionFromPoint === 'function') {
        const p = doc.caretPositionFromPoint(x, y)
        if (p) caret = { node: p.offsetNode, offset: p.offset }
      } else if (typeof doc.caretRangeFromPoint === 'function') {
        const r = doc.caretRangeFromPoint(x, y)
        if (r) caret = { node: r.startContainer, offset: r.startOffset }
      }
    } finally {
      root.style.visibility = visibility
    }
    const layer = opts.host.querySelector('[data-ink-text-layer]')
    return caret && layer?.contains(caret.node) ? caret : undefined
  }

  function focusAt(index: number): void {
    const id = order[Math.max(0, Math.min(order.length - 1, index))]
    if (id !== undefined) elements.get(id)?.focus()
  }

  /**
   * `Shift+Arrow` moves the annotation 1 pt in user space (`Shift+Alt+Arrow` 10 pt; up is +y).
   * `Ctrl+Shift+Arrow` or `Meta+Shift+Arrow` resizes a rect-shaped one by 1 pt: Right and Down
   * grow it, Left and Up shrink it, keeping its top-left corner. A free text resizes its text
   * box, as its corner handles do. Locked items ignore both.
   * Returns true when the key was one of these chords.
   */
  function onEditKey(e: KeyboardEvent, id: string): boolean {
    const step = ARROW_STEPS[e.key]
    if (!step || !e.shiftKey) return false
    e.preventDefault()
    const a = store.get(id)
    if (!a || a.locked) return true
    if (e.ctrlKey || e.metaKey) {
      if (a.type === 'freetext')
        store.update(id, resizedBox(a, resizedRect(freeTextBox(a), step.x, -step.y)))
      else if (hasRectGeometry(a))
        store.update(id, { rect: resizedRect(a.rect, step.x, -step.y, keepsAspect(a)) })
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
        // Enter on a free-text box edits it in place.
        if (e.key === 'Enter' && edit(id)) store.select([id])
        else activate(id)
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
      // Presses in a free-text editor place the caret: they are the editor's.
      if (e.target instanceof Element && e.target.closest('[data-ink-editor]')) return
      // A press on a custom element's own content (a host's button, say) is that content's:
      // no selection, and it bubbles on to the host's delegated handlers.
      if (
        e.target !== node &&
        node.hasAttribute('data-custom') &&
        !(e.target instanceof Element && e.target.closest('[data-handle]'))
      )
        return
      // Text markup waits for the release: a drag across it is a text selection.
      const a = store.get(id)
      if (a && isTextMarkup(a)) {
        pressMarkup(e, id)
        return
      }
      // A tool listening on the page root must not start a drag from this press.
      e.stopPropagation()
      activate(id)
    })
    node.addEventListener('dblclick', (e) => {
      if (e.target instanceof Element && e.target.closest('[data-ink-editor]')) return
      if (edit(id)) e.preventDefault()
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
    // Replies show in the thread popover only: no element, hit area or tab stop here.
    const current = withoutReplies(store.list.get())
      .filter((a) => a.page === page)
      .sort(readingOrder)
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
      // The box is gone (removed elsewhere, or undone): its edit goes with it.
      editorFor(node)?.close(false)
      node.remove()
      loupes?.drop(id)
      elements.delete(id)
      drawn.delete(id)
      hovered.delete(id)
    }

    masks.update(
      current.find((a): a is MaskAnnotation => a.type === 'mask'),
      transform
    )

    order = current.map((a) => a.id)
    for (const a of current) {
      let node = elements.get(a.id)
      if (!node) {
        node = create(a.id)
        elements.set(a.id, node)
      }
      applyAttributes(node, a)
      // An open editor owns the element's content and height until it closes; the element
      // still follows the page.
      if (editorFor(node)) {
        const height = node.style.height
        applyGeometry(node, a)
        node.style.height = height
      } else {
        applyGeometry(node, a)
        applyContent(node, a)
      }
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
      const scroll = opts.host.closest<HTMLElement>('[data-ink-viewport]')
      if (scroll) {
        // A container the host did not make focusable still takes focus from script.
        if (!scroll.hasAttribute('tabindex')) scroll.tabIndex = -1
        scroll.focus({ preventScroll: true })
      }
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
      // An editor is laid out for one zoom and rotation: a change to either commits it first
      // (focus moves to its box). Any other relayout leaves it open.
      if (next.zoom !== transform.zoom || next.rotation !== transform.rotation)
        closeEditors()
      transform = next
      render()
    },
    elementFor: (id) => elements.get(id),
    destroy() {
      if (destroyed) return
      closeEditors()
      destroyed = true
      markupPress?.()
      offList()
      offSelection()
      toolObserver?.disconnect()
      loupes?.destroy()
      masks.destroy()
      root.remove()
      elements.clear()
      drawn.clear()
      hovered.clear()
      order = []
    },
  }
}
