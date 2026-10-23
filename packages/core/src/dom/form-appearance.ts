// The PDF's own appearance of each form widget on a page, each in a small canvas of its own.
//
// The page canvas leaves form widgets out, and this layer draws each widget's appearance alone
// over the widget's rect, on the page canvas's pixel grid, so together they look as PDF.js
// draws the whole page. A checkbox or radio has both its on and off appearances drawn, and
// shows the one for its state. Showing, hiding or swapping an appearance paints nothing; only
// a new zoom, rotation or pixel ratio draws the shown widgets again.
//
// Inline styles are structural or geometric: the layer is `position:absolute; inset:0;
// overflow:hidden` over the page, and each canvas is placed at its widget's rect.
import { renderAppearance, type ToggleLook } from '../pdfjs/widget-appearance'

import { watchDevicePixelRatio } from './dpr-watch'

import type { PageTransform } from './transform'
import type { InkDocument } from '../model/document'
import type { Rect } from '../model/geometry'

/** Which appearance a widget shows: its own, one of a toggle's two, or none. */
export type WidgetLook = 'own' | ToggleLook | null

export interface AppearanceWidget {
  /** Widget (annotation) id. */
  id: string
  /** In user space. */
  rect: Rect
  /** A checkbox or radio, with an on and an off appearance. */
  toggle: boolean
}

export interface WidgetAppearancesOptions {
  /** The page host; the layer is created in its document but not attached. */
  host: HTMLElement
  document: InkDocument
  /** Zero-based page index. */
  page: number
  transform: PageTransform
  /** In paint order: a later widget's appearance lies over an earlier one's. */
  widgets: readonly AppearanceWidget[]
  /** Fixed device pixel ratio; `window.devicePixelRatio`, watched, when omitted. */
  devicePixelRatio?: number
  /** A widget's appearance failed to render (cancellations are not reported). */
  onError?(error: unknown): void
  /** Every appearance shown has painted, with no failure since the last such call. */
  onRendered?(): void
}

export interface WidgetAppearances {
  readonly element: HTMLElement
  /**
   * Resolves once every render started so far has painted, failed or been superseded. Never
   * rejects.
   */
  readonly rendered: Promise<void>
  /** Shows the widget's `look`, drawing it first if it is not drawn at the current geometry. */
  show(id: string, look: WidgetLook): void
  /** Draws the shown appearances again at a new zoom or rotation. */
  update(transform: PageTransform): void
  destroy(): void
}

/** CSS px an appearance canvas reaches past its widget's rect, to keep its anti-aliased edge. */
const PAD = 1

type Look = 'own' | ToggleLook

interface Slot {
  /** The painted canvas, for the geometry `key`. */
  canvas: HTMLCanvasElement | undefined
  key: string | undefined
  pending: { key: string; abort: AbortController } | undefined
}

interface Item {
  widget: AppearanceWidget
  /** Holds the widget's canvases, so they keep the widgets' paint order. */
  box: HTMLElement
  slots: Map<Look, Slot>
  shown: WidgetLook
}

const isAbort = (error: unknown): boolean =>
  (error as { name?: unknown } | null)?.name === 'AbortError'

/** Drops a canvas for good, freeing its bitmap now rather than at garbage collection. */
function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
  canvas.remove()
}

export function createWidgetAppearances(
  opts: WidgetAppearancesOptions
): WidgetAppearances {
  const { document: doc, page } = opts
  const ownerDoc = opts.host.ownerDocument
  const view = ownerDoc.defaultView
  const currentDpr = (): number =>
    opts.devicePixelRatio ??
    (view && view.devicePixelRatio > 0 ? view.devicePixelRatio : 1)

  const element = ownerDoc.createElement('div')
  element.className = 'ink-form-appearance'
  element.dataset.inkFormAppearance = ''
  element.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;'

  let transform = opts.transform
  let dpr = currentDpr()
  let destroyed = false
  const keyOf = () => `${transform.zoom}:${transform.totalRotation}:${dpr}`
  let key = keyOf()

  const items = new Map<string, Item>()
  for (const widget of opts.widgets) {
    const box = ownerDoc.createElement('div')
    box.dataset.inkAppearance = widget.id
    element.append(box)
    items.set(widget.id, { widget, box, slots: new Map(), shown: null })
  }

  let busy = 0
  let failed = false
  let resolveBusy: (() => void) | undefined
  let rendered: Promise<void> = Promise.resolve()
  const begin = () => {
    if (busy++ === 0) rendered = new Promise((resolve) => (resolveBusy = resolve))
  }
  const end = () => {
    if (--busy > 0) return
    const ok = !failed
    failed = false
    resolveBusy?.()
    resolveBusy = undefined
    if (ok && !destroyed) opts.onRendered?.()
  }

  /** The widget's canvas rect now, in device pixels of the page canvas. */
  const geometry = (w: AppearanceWidget) => {
    const r = transform.toCssRect(w.rect)
    const x = Math.floor((r.left - PAD) * dpr)
    const y = Math.floor((r.top - PAD) * dpr)
    const width = Math.max(1, Math.ceil((r.left + r.width + PAD) * dpr) - x)
    const height = Math.max(1, Math.ceil((r.top + r.height + PAD) * dpr) - y)
    return { x, y, width, height }
  }

  const place = (canvas: HTMLCanvasElement, g: ReturnType<typeof geometry>) => {
    const s = canvas.style
    s.left = `${g.x / dpr}px`
    s.top = `${g.y / dpr}px`
    s.width = `${g.width / dpr}px`
    s.height = `${g.height / dpr}px`
  }

  const looksOf = (item: Item): Look[] =>
    item.shown === null ? [] : item.widget.toggle ? ['checked', 'unchecked'] : ['own']

  const applyShown = (item: Item) => {
    for (const [look, slot] of item.slots)
      if (slot.canvas) slot.canvas.style.display = item.shown === look ? '' : 'none'
  }

  const draw = (item: Item, look: Look) => {
    let slot = item.slots.get(look)
    if (!slot)
      item.slots.set(
        look,
        (slot = { canvas: undefined, key: undefined, pending: undefined })
      )
    if (slot.key === key || slot.pending?.key === key) return
    slot.pending?.abort.abort()
    const g = geometry(item.widget)
    const canvas = ownerDoc.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    canvas.dataset.inkLook = look
    canvas.width = g.width
    canvas.height = g.height
    canvas.style.cssText = 'position:absolute;'
    place(canvas, g)
    const abort = new AbortController()
    const pending = { key, abort }
    slot.pending = pending
    const own = slot
    begin()
    renderAppearance(
      doc,
      {
        page,
        id: item.widget.id,
        ...(look === 'own' ? {} : { look }),
        canvas,
        zoom: transform.zoom,
        rotation: transform.totalRotation,
        devicePixelRatio: dpr,
        x: g.x,
        y: g.y,
      },
      abort.signal
    )
      .then(() => {
        if (destroyed || own.pending !== pending) return release(canvas)
        own.pending = undefined
        if (own.canvas) release(own.canvas)
        own.canvas = canvas
        own.key = pending.key
        item.box.append(canvas)
        applyShown(item)
      })
      .catch((error: unknown) => {
        release(canvas)
        if (own.pending === pending) own.pending = undefined
        if (destroyed || (abort.signal.aborted && isAbort(error))) return
        failed = true
        opts.onError?.(error)
      })
      .finally(end)
  }

  const ensure = (item: Item) => {
    for (const look of looksOf(item)) draw(item, look)
  }

  // Draw again when the device pixel ratio changes, unless the caller fixed it.
  const dprWatch =
    opts.devicePixelRatio === undefined
      ? watchDevicePixelRatio(view, currentDpr, () => api.update(transform))
      : undefined
  dprWatch?.watch(dpr)

  const api: WidgetAppearances = {
    element,
    get rendered() {
      return rendered
    },
    show(id, look) {
      const item = items.get(id)
      if (destroyed || !item) return
      item.shown = look
      applyShown(item)
      ensure(item)
    },
    update(next) {
      if (destroyed) return
      transform = next
      dpr = currentDpr()
      dprWatch?.watch(dpr)
      key = keyOf()
      for (const item of items.values()) {
        const wanted = new Set(looksOf(item))
        for (const [look, slot] of item.slots) {
          if (!slot.canvas || slot.key === key) continue
          // A shown appearance stays, stretched to the new rect, until its new one lands; a
          // hidden one is dropped and drawn again when it shows.
          if (wanted.has(look)) place(slot.canvas, geometry(item.widget))
          else {
            release(slot.canvas)
            slot.canvas = undefined
            slot.key = undefined
          }
        }
        ensure(item)
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      dprWatch?.destroy()
      for (const item of items.values())
        for (const slot of item.slots.values()) {
          slot.pending?.abort.abort()
          if (slot.canvas) release(slot.canvas)
        }
      items.clear()
      element.remove()
    },
  }
  return api
}
