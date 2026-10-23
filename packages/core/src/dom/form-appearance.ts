// The PDF's own appearance of each form widget on a page, each shown in a small canvas of its
// own.
//
// The page canvas leaves form widgets out, and this layer draws their appearances apart from
// it, on the page canvas's pixel grid, so together they look as PDF.js draws the whole page.
// The widgets are drawn in batched passes: one render per look (the widgets' own appearances, a
// toggle's checked ones, its unchecked ones) into a scratch canvas over all their rects, which
// is then cut into one canvas per widget. Widgets that overlap go in a pass of their own, so
// none picks up another's pixels. A checkbox or radio has both looks drawn, the one it does not
// show when the browser is idle, and shows the one for its state. Showing, hiding or swapping
// an appearance paints nothing; only a new zoom, rotation or pixel ratio draws the shown
// widgets again.
//
// Inline styles are structural or geometric: the layer is `position:absolute; inset:0;
// overflow:hidden` over the page, and each canvas is placed at its widget's rect.
import { renderAppearances, type AppearanceLook } from '../pdfjs/widget-appearance'

import { watchDevicePixelRatio } from './dpr-watch'

import type { PageTransform } from './transform'
import type { InkDocument } from '../model/document'
import type { Rect } from '../model/geometry'

/** Which appearance a widget shows: its own, one of a toggle's two, or none. */
export type WidgetLook = AppearanceLook | null

export interface AppearanceWidget {
  /** Widget (annotation) id. */
  id: string
  /** In user space. */
  rect: Rect
  /** A checkbox or radio, with an on and an off appearance. */
  toggle: boolean
  /**
   * PDF.js should have an appearance for it: shown in the file and not an empty signature
   * field. A pass that finds none of these reports an error.
   */
  expected: boolean
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
  /** A pass of appearances failed to render (cancellations are not reported). */
  onError?(error: unknown): void
  /** Every appearance asked for has painted, with no failure since the last such call. */
  onRendered?(): void
}

export interface WidgetAppearances {
  readonly element: HTMLElement
  /**
   * Resolves once every pass asked for so far, idle ones included, has painted, failed or been
   * superseded. Never rejects.
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

type Look = AppearanceLook

interface Geometry {
  x: number
  y: number
  width: number
  height: number
}

interface Pass {
  key: string
  abort: AbortController
  /** Slots still waiting on this pass; at none it is aborted. */
  users: number
}

interface Slot {
  /** The painted canvas, for the geometry `key` at `rotation`. */
  canvas: HTMLCanvasElement | undefined
  key: string | undefined
  rotation: number | undefined
  /** Queued for, or being drawn by, a pass at the geometry `key`. */
  queued: string | undefined
  pending: Pass | undefined
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

const overlaps = (a: Geometry, b: Geometry) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height

/** The widget appearances of one page. */
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
  const geometry = (w: AppearanceWidget): Geometry => {
    const r = transform.toCssRect(w.rect)
    const x = Math.floor((r.left - PAD) * dpr)
    const y = Math.floor((r.top - PAD) * dpr)
    const width = Math.max(1, Math.ceil((r.left + r.width + PAD) * dpr) - x)
    const height = Math.max(1, Math.ceil((r.top + r.height + PAD) * dpr) - y)
    return { x, y, width, height }
  }

  const place = (canvas: HTMLCanvasElement, g: Geometry) => {
    const s = canvas.style
    s.left = `${g.x / dpr}px`
    s.top = `${g.y / dpr}px`
    s.width = `${g.width / dpr}px`
    s.height = `${g.height / dpr}px`
  }

  const slotOf = (item: Item, look: Look): Slot => {
    let slot = item.slots.get(look)
    if (!slot) {
      slot = {
        canvas: undefined,
        key: undefined,
        rotation: undefined,
        queued: undefined,
        pending: undefined,
      }
      item.slots.set(look, slot)
    }
    return slot
  }

  /** The looks the widget needs drawn: the one it shows, and a toggle's other one. */
  const wantedOf = (item: Item): Look[] =>
    item.shown === null
      ? []
      : item.widget.toggle
        ? [item.shown, item.shown === 'checked' ? 'unchecked' : 'checked']
        : [item.shown]

  /**
   * Shows the canvas of the look the widget shows. A bitmap drawn at another rotation stays
   * hidden until its new one lands, as it would show turned the wrong way.
   */
  const applyShown = (item: Item) => {
    for (const [look, slot] of item.slots)
      if (slot.canvas)
        slot.canvas.style.display =
          item.shown === look && slot.rotation === transform.totalRotation ? '' : 'none'
  }

  /** Stops waiting on the slot's pass, aborting the pass once nothing waits on it. */
  const drop = (slot: Slot) => {
    const pass = slot.pending
    slot.pending = undefined
    slot.queued = undefined
    if (pass && --pass.users === 0) pass.abort.abort()
  }

  // Widgets waiting for a pass, by look: drawn soon, or when the browser is idle.
  const soon = new Map<Look, Set<Item>>()
  const later = new Map<Look, Set<Item>>()
  let soonScheduled = false
  let idleHandle: (() => void) | undefined

  const idle = (fn: () => void): (() => void) => {
    if (view?.requestIdleCallback) {
      const handle = view.requestIdleCallback(fn, { timeout: 500 })
      return () => view.cancelIdleCallback(handle)
    }
    const handle = setTimeout(fn, 50)
    return () => clearTimeout(handle)
  }

  const request = (item: Item, look: Look, urgent: boolean) => {
    const slot = slotOf(item, look)
    if (slot.key === key && slot.canvas) return
    if (slot.pending?.key === key) return
    if (slot.queued === key && (!urgent || soon.get(look)?.has(item))) return
    if (slot.pending) drop(slot)
    slot.queued = key
    later.get(look)?.delete(item)
    const queue = urgent ? soon : later
    let set = queue.get(look)
    if (!set) queue.set(look, (set = new Set()))
    set.add(item)
    if (urgent && !soonScheduled) {
      soonScheduled = true
      begin()
      queueMicrotask(() => {
        soonScheduled = false
        flush(soon)
        end()
      })
    } else if (!urgent && !idleHandle) {
      begin()
      idleHandle = idle(() => {
        idleHandle = undefined
        flush(later)
        end()
      })
    }
  }

  const ensure = (item: Item) => {
    wantedOf(item).forEach((look, i) => request(item, look, i === 0))
  }

  /** Starts a pass per look for the widgets queued in `queue`. */
  const flush = (queue: Map<Look, Set<Item>>) => {
    if (destroyed) return
    for (const [look, set] of queue) {
      // A pass that runs now takes the same look's idle widgets along: they cost it little.
      const idleToo = queue === later ? undefined : later.get(look)
      const ready = [...set, ...(idleToo ?? [])].filter(
        (item) => item.slots.get(look)?.queued === key
      )
      set.clear()
      idleToo?.clear()
      // Widgets whose canvases overlap go in separate passes.
      const groups: { item: Item; g: Geometry }[][] = []
      for (const item of ready) {
        const g = geometry(item.widget)
        const group = groups.find((members) => members.every((m) => !overlaps(m.g, g)))
        if (group) group.push({ item, g })
        else groups.push([{ item, g }])
      }
      for (const group of groups) startPass(look, group)
    }
    queue.clear()
  }

  const startPass = (look: Look, members: { item: Item; g: Geometry }[]) => {
    const x = Math.min(...members.map((m) => m.g.x))
    const y = Math.min(...members.map((m) => m.g.y))
    const right = Math.max(...members.map((m) => m.g.x + m.g.width))
    const bottom = Math.max(...members.map((m) => m.g.y + m.g.height))
    const scratch = ownerDoc.createElement('canvas')
    scratch.width = right - x
    scratch.height = bottom - y
    const pass: Pass = { key, abort: new AbortController(), users: members.length }
    const rotation = transform.totalRotation
    for (const { item } of members) slotOf(item, look).pending = pass
    begin()
    renderAppearances(
      doc,
      {
        page,
        look,
        ids: new Set(members.map((m) => m.item.widget.id)),
        canvas: scratch,
        zoom: transform.zoom,
        rotation,
        devicePixelRatio: dpr,
        x,
        y,
      },
      pass.abort.signal
    )
      .then((found) => {
        if (destroyed) return
        for (const { item, g } of members) {
          const slot = slotOf(item, look)
          // Superseded, no longer wanted, or drawn for a geometry that has since changed.
          if (slot.pending !== pass) continue
          slot.pending = undefined
          slot.queued = undefined
          if (pass.key !== key) continue
          const canvas = ownerDoc.createElement('canvas')
          canvas.setAttribute('aria-hidden', 'true')
          canvas.dataset.inkLook = look
          canvas.width = g.width
          canvas.height = g.height
          canvas.style.cssText = 'position:absolute;'
          place(canvas, g)
          canvas
            .getContext('2d')
            ?.drawImage(
              scratch,
              g.x - x,
              g.y - y,
              g.width,
              g.height,
              0,
              0,
              g.width,
              g.height
            )
          if (slot.canvas) release(slot.canvas)
          slot.canvas = canvas
          slot.key = pass.key
          slot.rotation = rotation
          item.box.append(canvas)
          applyShown(item)
        }
        const expected = members.filter((m) => m.item.widget.expected)
        if (expected.length > 0 && expected.every((m) => !found.has(m.item.widget.id))) {
          failed = true
          opts.onError?.(
            new Error(
              `Page ${page + 1}: no form widget appearances found in the page's operator list`
            )
          )
        }
      })
      .catch((error: unknown) => {
        for (const { item } of members) {
          const slot = slotOf(item, look)
          if (slot.pending === pass) {
            slot.pending = undefined
            slot.queued = undefined
          }
        }
        if (destroyed || (pass.abort.signal.aborted && isAbort(error))) return
        failed = true
        opts.onError?.(error)
      })
      .finally(() => {
        release(scratch)
        end()
      })
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
      if (destroyed || !item || item.shown === look) return
      item.shown = look
      const wanted = new Set(wantedOf(item))
      for (const [l, slot] of item.slots) if (!wanted.has(l)) drop(slot)
      applyShown(item)
      ensure(item)
    },
    update(next) {
      if (destroyed) return
      transform = next
      dpr = currentDpr()
      dprWatch?.watch(dpr)
      const before = key
      key = keyOf()
      if (key === before) return
      for (const item of items.values()) {
        const wanted = new Set(wantedOf(item))
        for (const [look, slot] of item.slots) {
          // Waiting on a pass for the old geometry: its result would land in the wrong place.
          if (slot.pending || slot.queued) drop(slot)
          if (!slot.canvas) continue
          // A shown appearance stays, stretched to the new rect, until its new one lands; a
          // hidden one is dropped and drawn again when it shows.
          if (wanted.has(look)) place(slot.canvas, geometry(item.widget))
          else {
            release(slot.canvas)
            slot.canvas = undefined
            slot.key = undefined
            slot.rotation = undefined
          }
        }
        applyShown(item)
        ensure(item)
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      dprWatch?.destroy()
      idleHandle?.()
      if (idleHandle) end()
      idleHandle = undefined
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
