// The PDF's own appearance of each form widget on a page, each shown in a small canvas of its
// own.
//
// The page canvas leaves form widgets out, and this layer draws their appearances apart from
// it, on the page canvas's pixel grid, so together they look as PDF.js draws the whole page.
// The widgets are drawn in batched passes: one render per look (the widgets' own appearances, a
// toggle's checked ones, its unchecked ones) into a scratch canvas over their rects, which is
// then cut into one canvas per widget. Widgets whose rects overlap go in a pass of their own,
// so none picks up another's pixels; touching ones share a pass, as PDF.js clips each
// appearance to its rect, and each widget's canvas has its neighbours' edges cleared out of
// its padding. A pass's scratch canvas stays under a pixel budget, and a page runs
// its passes one at a time, so one scratch canvas at most is alive per page. A checkbox or
// radio has both looks drawn, the one it does not show when the browser is idle, and shows the
// one for its state. Showing, hiding or swapping an appearance paints nothing; only a new zoom,
// rotation or pixel ratio draws the shown widgets again.
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
   * The looks PDF.js should have a run for, by the file's appearance states: shown in the file
   * and with an appearance stream for the look. A pass that finds none of the widgets that
   * expect its look reports an error.
   */
  expects: ReadonlySet<AppearanceLook>
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
  /**
   * A pass of appearances failed to render, and failed again when retried (cancellations are
   * not reported). A look that keeps failing is reported once per geometry.
   */
  onError?(error: unknown): void
  /** Every look shown has painted, with no failure since the last such call. */
  onRendered?(): void
}

export interface WidgetAppearances {
  readonly element: HTMLElement
  /**
   * Resolves once the looks shown so far have painted, failed or been superseded. A toggle's
   * look it does not show is drawn later, when the browser is idle. Never rejects.
   */
  readonly rendered: Promise<void>
  /** Shows the widget's `look`, drawing it first if it is not drawn at the current geometry. */
  show(id: string, look: WidgetLook): void
  /** Draws the shown appearances again at a new zoom or rotation. */
  update(transform: PageTransform): void
  destroy(): void
}

/** Device px an appearance canvas reaches past its widget's rect, for its anti-aliased edge. */
const PAD = 1

/** Device px a pass's scratch canvas may cover, unless one widget alone needs more. */
export const SCRATCH_BUDGET = 4_000_000

/** Failed draws of one look at one geometry before the layer stops retrying it. */
const ATTEMPTS = 2

type Look = AppearanceLook

interface Geometry {
  x: number
  y: number
  width: number
  height: number
}

interface Member {
  item: Item
  /** The widget's canvas, padded. */
  g: Geometry
}

interface Pass {
  key: string
  look: Look
  members: Member[]
  abort: AbortController
  /** Slots still waiting on this pass; at none it is aborted. */
  users: number
  /** Draws a look a widget shows: `rendered` waits for it. */
  shown: boolean
}

interface Slot {
  /** The painted canvas, for the geometry `key` at `rotation`. */
  canvas: HTMLCanvasElement | undefined
  key: string | undefined
  rotation: number | undefined
  /** Queued for, or being drawn by, a pass at the geometry `key`. */
  queued: string | undefined
  pending: Pass | undefined
  /** Failed draws at the geometry `failedKey`. */
  failedKey: string | undefined
  failures: number
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

/**
 * Whether two padded canvases' widget rects (the pads left off) overlap by more than the one
 * device pixel that rects meeting edge to edge between pixels both cover.
 */
const overlaps = (a: Geometry, b: Geometry) =>
  a.x + PAD + 1 < b.x + b.width - PAD &&
  b.x + PAD + 1 < a.x + a.width - PAD &&
  a.y + PAD + 1 < b.y + b.height - PAD &&
  b.y + PAD + 1 < a.y + a.height - PAD

/** A padded canvas's widget rect, the pads left off, as edges in device px. */
const inner = (g: Geometry) => ({
  x0: g.x + PAD,
  x1: g.x + g.width - PAD,
  y0: g.y + PAD,
  y1: g.y + g.height - PAD,
})

/**
 * The part of `of`'s padded canvas that a neighbour in its pass draws and `of` does not: the
 * neighbour's rect, less the pixel row or column the two rects share where they touch.
 */
function neighbourStrip(of: Geometry, near: Geometry): Geometry | undefined {
  const a = inner(of)
  const b = inner(near)
  let { x0, x1, y0, y1 } = b
  // Along an axis where the rects meet (sharing at most a pixel), keep what `of` covers.
  if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) <= 1) {
    if (b.x0 >= a.x0) x0 = Math.max(x0, a.x1)
    else x1 = Math.min(x1, a.x0)
  }
  if (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) <= 1) {
    if (b.y0 >= a.y0) y0 = Math.max(y0, a.y1)
    else y1 = Math.min(y1, a.y0)
  }
  x0 = Math.max(x0, of.x)
  y0 = Math.max(y0, of.y)
  x1 = Math.min(x1, of.x + of.width)
  y1 = Math.min(y1, of.y + of.height)
  return x1 > x0 && y1 > y0
    ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
    : undefined
}

const union = (members: readonly Member[]): Geometry => {
  const x = Math.min(...members.map((m) => m.g.x))
  const y = Math.min(...members.map((m) => m.g.y))
  const right = Math.max(...members.map((m) => m.g.x + m.g.width))
  const bottom = Math.max(...members.map((m) => m.g.y + m.g.height))
  return { x, y, width: right - x, height: bottom - y }
}

/** Splits members, top to bottom, into runs whose union stays within the scratch budget. */
function chunks(members: Member[]): Member[][] {
  const sorted = [...members].sort((a, b) => a.g.y - b.g.y || a.g.x - b.g.x)
  const out: Member[][] = []
  let run: Member[] = []
  for (const m of sorted) {
    const next = [...run, m]
    const u = union(next)
    if (run.length > 0 && u.width * u.height > SCRATCH_BUDGET) {
      out.push(run)
      run = [m]
    } else run = next
  }
  if (run.length > 0) out.push(run)
  return out
}

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

  // Work on shown looks: `rendered` and `onRendered` wait for it, not for idle work.
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
    const x = Math.floor(r.left * dpr) - PAD
    const y = Math.floor(r.top * dpr) - PAD
    const width = Math.max(1, Math.ceil((r.left + r.width) * dpr) + PAD - x)
    const height = Math.max(1, Math.ceil((r.top + r.height) * dpr) + PAD - y)
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
        failedKey: undefined,
        failures: 0,
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

  // Passes waiting to run, and the one running: one scratch canvas at a time.
  const jobs: Pass[] = []
  let running = false

  /**
   * An idle pass now draws a look a widget shows: `rendered` waits for it, and a queued one
   * goes before the idle work.
   */
  const promote = (pass: Pass) => {
    if (pass.shown) return
    pass.shown = true
    begin()
    const at = jobs.indexOf(pass)
    if (at < 0) return
    jobs.splice(at, 1)
    const first = jobs.findIndex((j) => !j.shown)
    jobs.splice(first < 0 ? jobs.length : first, 0, pass)
  }

  const request = (item: Item, look: Look, urgent: boolean) => {
    const slot = slotOf(item, look)
    if (slot.key === key && slot.canvas) return
    if (slot.pending?.key === key) {
      if (urgent) promote(slot.pending)
      return
    }
    if (slot.failedKey === key && slot.failures >= ATTEMPTS) return
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
      idleHandle = idle(() => {
        idleHandle = undefined
        flush(later)
      })
    }
  }

  const ensure = (item: Item) => {
    wantedOf(item).forEach((look, i) => request(item, look, i === 0))
  }

  /** Queues a pass per look, per group of widgets that do not overlap, for `queue`. */
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
      const groups: Member[][] = []
      for (const item of ready) {
        const g = geometry(item.widget)
        const group = groups.find((members) => members.every((m) => !overlaps(m.g, g)))
        if (group) group.push({ item, g })
        else groups.push([{ item, g }])
      }
      for (const group of groups)
        for (const members of chunks(group)) {
          const pass: Pass = {
            key,
            look,
            members,
            abort: new AbortController(),
            users: members.length,
            shown: members.some((m) => m.item.shown === look),
          }
          for (const { item } of members) slotOf(item, look).pending = pass
          if (pass.shown) {
            begin()
            // Shown looks go before idle work already waiting.
            const at = jobs.findIndex((j) => !j.shown)
            jobs.splice(at < 0 ? jobs.length : at, 0, pass)
          } else jobs.push(pass)
        }
    }
    queue.clear()
    pump()
  }

  const pump = () => {
    if (running || destroyed) return
    const pass = jobs.shift()
    if (!pass) return
    running = true
    void run(pass).finally(() => {
      running = false
      if (pass.shown) end()
      pump()
    })
  }

  const fail = (pass: Pass, error: unknown) => {
    for (const { item } of pass.members) {
      const slot = slotOf(item, pass.look)
      if (slot.failedKey !== pass.key) slot.failures = 0
      slot.failedKey = pass.key
      slot.failures++
    }
    if (pass.shown) failed = true
    // Try once more; a look that keeps failing waits for a new geometry. Only a failure that
    // gets no retry is reported, so a look fails aloud once per geometry.
    for (const { item } of pass.members)
      if (wantedOf(item).includes(pass.look)) request(item, pass.look, false)
    const retrying = pass.members.some(
      ({ item }) => slotOf(item, pass.look).queued === pass.key
    )
    if (!retrying) opts.onError?.(error)
  }

  const run = async (pass: Pass): Promise<void> => {
    const { look, members } = pass
    if (pass.abort.signal.aborted || pass.key !== key) {
      for (const { item } of members) {
        const slot = slotOf(item, look)
        if (slot.pending === pass) drop(slot)
      }
      // Dropped for a new geometry: the widgets that still want the look ask again.
      for (const { item } of members) ensure(item)
      return
    }
    const u = union(members)
    const scratch = ownerDoc.createElement('canvas')
    scratch.width = u.width
    scratch.height = u.height
    const rotation = transform.totalRotation
    try {
      const found = await renderAppearances(
        doc,
        {
          page,
          look,
          ids: new Set(members.map((m) => m.item.widget.id)),
          canvas: scratch,
          zoom: transform.zoom,
          rotation,
          devicePixelRatio: dpr,
          x: u.x,
          y: u.y,
        },
        pass.abort.signal
      )
      if (destroyed) return
      for (const { item, g } of members) {
        const slot = slotOf(item, look)
        // Superseded, no longer wanted, or drawn for a geometry that has since changed.
        if (slot.pending !== pass) continue
        slot.pending = undefined
        slot.queued = undefined
        if (pass.key !== key) {
          ensure(item)
          continue
        }
        const canvas = ownerDoc.createElement('canvas')
        canvas.setAttribute('aria-hidden', 'true')
        canvas.dataset.inkLook = look
        canvas.width = g.width
        canvas.height = g.height
        canvas.style.cssText = 'position:absolute;'
        place(canvas, g)
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(
          scratch,
          g.x - u.x,
          g.y - u.y,
          g.width,
          g.height,
          0,
          0,
          g.width,
          g.height
        )
        // A touching neighbour's edge is its own canvas's to show: clear it from this one, so
        // it is not drawn twice, nor left behind once the neighbour hides.
        for (const other of members) {
          if (other.item === item) continue
          const strip = neighbourStrip(g, other.g)
          if (strip)
            ctx?.clearRect(strip.x - g.x, strip.y - g.y, strip.width, strip.height)
        }
        if (slot.canvas) release(slot.canvas)
        slot.canvas = canvas
        slot.key = pass.key
        slot.rotation = rotation
        slot.failures = 0
        item.box.append(canvas)
        applyShown(item)
      }
      const expecting = members.filter((m) => m.item.widget.expects.has(look))
      if (expecting.length > 0 && expecting.every((m) => !found.has(m.item.widget.id)))
        fail(
          pass,
          new Error(
            `Page ${page + 1}: no form widget appearances found in the page's operator list`
          )
        )
    } catch (error) {
      for (const { item } of members) {
        const slot = slotOf(item, look)
        if (slot.pending === pass) {
          slot.pending = undefined
          slot.queued = undefined
        }
      }
      if (destroyed) return
      if (pass.abort.signal.aborted && isAbort(error)) {
        for (const { item } of members) ensure(item)
        return
      }
      fail(pass, error)
    } finally {
      release(scratch)
    }
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
      if (item.shown !== look) {
        item.shown = look
        const wanted = new Set(wantedOf(item))
        for (const [l, slot] of item.slots) if (!wanted.has(l)) drop(slot)
        applyShown(item)
      }
      // Also after a pass failed or was dropped: a look drawn or on its way asks for nothing.
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
      idleHandle = undefined
      for (const pass of jobs.splice(0)) if (pass.shown) end()
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
