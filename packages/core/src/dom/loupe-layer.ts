// The loupe's magnified view: one canvas per loupe, first in the loupe's own annotation
// element, under the rim the overlay draws. It holds the page region under the loupe's centre,
// `magnification` times smaller than the loupe, rendered at the zoom times the device pixel
// ratio times the magnification, so it fills the element at full sharpness. Page content only:
// session annotations under the loupe are not magnified.
//
// The region, the box and the clip circle come from the loupe's drawing (its `page` item).
//
// Inline styles are structural: the canvas fills the element (`position:absolute; left:0;
// top:0; width:100%; height:100%`), is clipped to the lens circle (`clip-path`, set from the
// drawing at each attach) and leaves the pointer to the rim (`pointer-events:none`).
import { loupeRegion } from '../model/annotations/drawing/loupe'
import { renderRegion } from '../pdfjs/render-region'

import { watchDevicePixelRatio, type DprWatch } from './dpr-watch'
import { drawingFor } from './drawing-context'

import type { PageTransform } from './transform'
import type { LoupeAnnotation } from '../model/annotations/types'
import type { InkDocument } from '../model/document'
import type { Rect } from '../model/geometry'

/** Pause after a move, resize or zoom before a loupe re-renders, in ms. */
export const LOUPE_RENDER_DELAY = 100

export interface LoupeLayerOptions {
  document: InkDocument
  /**
   * Fixed device pixel ratio. When omitted, `window.devicePixelRatio` is read at every render
   * and the loupes re-render when it changes (browser zoom, moving to another screen).
   */
  devicePixelRatio?: number
}

export interface LoupeLayer {
  /**
   * Puts the loupe's canvas first in `el`, its annotation element, and brings it up to date
   * with `a` at `t`. The first render starts at once; later ones wait for a pause of
   * `LOUPE_RENDER_DELAY` ms in the changes, and a change aborts a render in flight. The last
   * bitmap stays, stretched with the element, until the next one lands.
   *
   * With `hidden` the canvas is kept out of sight, last in `el`, and renders all the same: for
   * a loupe the page canvas still paints, so that its lens is ready when the overlay takes it
   * over and shows with its rim.
   */
  attach(el: HTMLElement, a: LoupeAnnotation, t: PageTransform, hidden?: boolean): void
  /** Forgets a loupe that is gone, cancelling its render. */
  drop(id: string): void
  destroy(): void
}

export { loupeRegion }

interface Lens {
  canvas: HTMLCanvasElement
  /** What the canvas shows or is about to: the last scheduled render's inputs. */
  key: string | undefined
  timer: ReturnType<typeof setTimeout> | undefined
  controller: AbortController | undefined
  /** The last `attach`, replayed when the device pixel ratio changes. */
  last:
    { el: HTMLElement; a: LoupeAnnotation; t: PageTransform; hidden: boolean } | undefined
}

/** Frees a canvas's bitmap now rather than at garbage collection (Safari caps the total). */
function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
  canvas.remove()
}

export function createLoupeLayer(opts: LoupeLayerOptions): LoupeLayer {
  const lenses = new Map<string, Lens>()
  let destroyed = false
  let dprWatch: DprWatch | undefined

  const dprOf = (el: HTMLElement): number => {
    if (opts.devicePixelRatio !== undefined) return opts.devicePixelRatio
    const ratio = el.ownerDocument.defaultView?.devicePixelRatio ?? 1
    return ratio > 0 ? ratio : 1
  }

  const stop = (lens: Lens): void => {
    clearTimeout(lens.timer)
    lens.timer = undefined
    lens.controller?.abort()
    lens.controller = undefined
  }

  async function render(
    lens: Lens,
    page: number,
    region: Rect,
    scale: number,
    rotation: number
  ): Promise<void> {
    const controller = new AbortController()
    lens.controller = controller
    const doc = lens.canvas.ownerDocument
    const next = doc.createElement('canvas')
    try {
      await renderRegion(
        opts.document,
        page,
        region,
        scale,
        next,
        controller.signal,
        rotation
      )
      if (controller.signal.aborted || destroyed) return
      lens.canvas.width = next.width
      lens.canvas.height = next.height
      lens.canvas.getContext('2d')?.drawImage(next, 0, 0)
    } catch {
      // Aborted for a newer render, or failed: the last bitmap stays. A failure has nowhere
      // useful to go; the page canvas reports the document's render failures.
    } finally {
      release(next)
      if (lens.controller === controller) lens.controller = undefined
    }
  }

  function lensFor(el: HTMLElement, id: string): Lens {
    const known = lenses.get(id)
    if (known) return known
    const canvas = el.ownerDocument.createElement('canvas')
    canvas.className = 'ink-loupe-lens'
    canvas.dataset.inkLoupe = ''
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.cssText =
      'position:absolute;left:0;top:0;width:100%;height:100%;' + 'pointer-events:none;'
    // Blank until the first render lands.
    canvas.width = 0
    canvas.height = 0
    const lens: Lens = {
      canvas,
      key: undefined,
      timer: undefined,
      controller: undefined,
      last: undefined,
    }
    lenses.set(id, lens)
    return lens
  }

  function attach(
    el: HTMLElement,
    a: LoupeAnnotation,
    t: PageTransform,
    hidden = false
  ): void {
    if (destroyed) return
    const lens = lensFor(el, a.id)
    lens.last = { el, a, t, hidden }
    lens.canvas.style.visibility = hidden ? 'hidden' : ''
    // Out of sight it goes last, so the element's first child stays its hit area.
    if (hidden) {
      if (el.lastChild !== lens.canvas) el.append(lens.canvas)
    } else if (el.firstChild !== lens.canvas) el.prepend(lens.canvas)
    const lensItem = drawingFor(a, t)?.items.find((i) => i.kind === 'page')
    const region = lensItem?.kind === 'page' ? lensItem.source : loupeRegion(a)
    if (lensItem?.kind === 'page') {
      // The lens circle in element-local CSS px.
      const box = t.toCssRect(lensItem.target)
      const c = t.toCss(lensItem.clip.center)
      lens.canvas.style.clipPath = `circle(${t.toCssLength(lensItem.clip.radius)}px at ${c.x - box.left}px ${c.y - box.top}px)`
    }
    const dpr = dprOf(el)
    if (opts.devicePixelRatio === undefined) {
      dprWatch ??= watchDevicePixelRatio(
        el.ownerDocument.defaultView,
        () => dprOf(el),
        () => {
          for (const { last } of [...lenses.values()])
            if (last) attach(last.el, last.a, last.t, last.hidden)
        }
      )
      dprWatch.watch(dpr)
    }
    const scale = t.zoom * dpr * a.magnification
    const rotation = t.totalRotation
    const key = JSON.stringify([a.page, region, scale, rotation])
    if (key === lens.key) return
    const first = lens.key === undefined
    lens.key = key
    stop(lens)
    if (first) {
      void render(lens, a.page, region, scale, rotation)
      return
    }
    lens.timer = setTimeout(() => {
      lens.timer = undefined
      void render(lens, a.page, region, scale, rotation)
    }, LOUPE_RENDER_DELAY)
  }

  // File annotations lifted into the session leave the magnified page too: render each lens
  // again, at once.
  const stopLifted = opts.document._lifted.subscribe(() => {
    for (const lens of lenses.values()) {
      lens.key = undefined
      if (lens.last) attach(lens.last.el, lens.last.a, lens.last.t, lens.last.hidden)
    }
  })

  return {
    attach,
    drop(id) {
      const lens = lenses.get(id)
      if (!lens) return
      stop(lens)
      release(lens.canvas)
      lenses.delete(id)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      stopLifted()
      dprWatch?.destroy()
      for (const lens of lenses.values()) {
        stop(lens)
        release(lens.canvas)
      }
      lenses.clear()
    },
  }
}
