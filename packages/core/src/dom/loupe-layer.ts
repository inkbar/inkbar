// The loupe's magnified view: one canvas per loupe, first in the loupe's own annotation
// element, under the rim the overlay draws. It holds the page region under the loupe's centre,
// `magnification` times smaller than the loupe, rendered at the zoom times the device pixel
// ratio times the magnification, so it fills the element at full sharpness. Page content only:
// session annotations under the loupe are not magnified.
//
// Inline styles are structural: the canvas fills the element (`position:absolute; left:0;
// top:0; width:100%; height:100%`), is clipped to the inscribed circle (`clip-path`) and leaves
// the pointer to the rim (`pointer-events:none`).
import { renderRegion } from '../pdfjs/render-region'

import type { PageTransform } from './transform'
import type { LoupeAnnotation } from '../model/annotations/types'
import type { InkDocument } from '../model/document'
import type { Rect } from '../model/geometry'

/** Pause after a move, resize or zoom before a loupe re-renders, in ms. */
export const LOUPE_RENDER_DELAY = 100

export interface LoupeLayerOptions {
  document: InkDocument
  /** Fixed device pixel ratio; `window.devicePixelRatio` at each render when omitted. */
  devicePixelRatio?: number
}

export interface LoupeLayer {
  /**
   * Puts the loupe's canvas first in `el`, its annotation element, and brings it up to date
   * with `a` at `t`. The first render starts at once; later ones wait for a pause of
   * `LOUPE_RENDER_DELAY` ms in the changes, and a change aborts a render in flight. The last
   * bitmap stays, stretched with the element, until the next one lands.
   */
  attach(el: HTMLElement, a: LoupeAnnotation, t: PageTransform): void
  /** Forgets a loupe that is gone, cancelling its render. */
  drop(id: string): void
  destroy(): void
}

/** The page region a loupe shows: its rect shrunk by the magnification about its centre. */
export function loupeRegion(a: Pick<LoupeAnnotation, 'rect' | 'magnification'>): Rect {
  const { rect, magnification } = a
  const width = rect.width / magnification
  const height = rect.height / magnification
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  }
}

interface Lens {
  canvas: HTMLCanvasElement
  /** What the canvas shows or is about to: the last scheduled render's inputs. */
  key: string | undefined
  timer: ReturnType<typeof setTimeout> | undefined
  controller: AbortController | undefined
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
      'position:absolute;left:0;top:0;width:100%;height:100%;' +
      'clip-path:circle(50%);pointer-events:none;'
    // Blank until the first render lands.
    canvas.width = 0
    canvas.height = 0
    const lens: Lens = { canvas, key: undefined, timer: undefined, controller: undefined }
    lenses.set(id, lens)
    return lens
  }

  return {
    attach(el, a, t) {
      if (destroyed) return
      const lens = lensFor(el, a.id)
      if (el.firstChild !== lens.canvas) el.prepend(lens.canvas)
      const region = loupeRegion(a)
      const scale = t.zoom * dprOf(el) * a.magnification
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
    },
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
      for (const lens of lenses.values()) {
        stop(lens)
        release(lens.canvas)
      }
      lenses.clear()
    },
  }
}
