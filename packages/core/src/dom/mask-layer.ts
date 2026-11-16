// The mask's dimming: one SVG per page, between the page content (canvas, text layer) and the
// annotation overlay, painted from the mask's drawing: one even-odd path, the whole page minus
// the mask's shape. The mask annotation's own element (drawn by the overlay) is the shape's
// outline and takes the hits; this layer never does.
//
// Inline styles and attributes are structural: the SVG is `position:absolute; left:0; top:0;
// pointer-events:none` at the page's CSS size.
import { drawingFor } from './drawing-context'
import { paintItems } from './drawing-svg'

import type { PageTransform } from './transform'
import type { MaskAnnotation } from '../model/annotations/types'

const SVG = 'http://www.w3.org/2000/svg'

export interface MaskLayer {
  /** Draws `mask` at `t`, or removes the layer when there is none. */
  update(mask: MaskAnnotation | undefined, t: PageTransform): void
  destroy(): void
}

/** The page's mask layer: its SVG goes into `host` just before `before`, the annotation overlay. */
export function createMaskLayer(host: HTMLElement, before: Node): MaskLayer {
  let svg: SVGSVGElement | undefined

  return {
    update(mask, t) {
      if (!mask) {
        svg?.remove()
        svg = undefined
        return
      }
      if (!svg) {
        const doc = host.ownerDocument
        svg = doc.createElementNS(SVG, 'svg')
        svg.classList.add('ink-mask-layer')
        svg.dataset.inkMaskLayer = ''
        svg.setAttribute('aria-hidden', 'true')
        svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;'
      }
      if (svg.parentNode !== host || svg.nextSibling !== before)
        host.insertBefore(svg, before)
      svg.setAttribute('width', String(t.cssWidth))
      svg.setAttribute('height', String(t.cssHeight))
      svg.setAttribute('viewBox', `0 0 ${t.cssWidth} ${t.cssHeight}`)
      const drawing = drawingFor(mask, t)
      svg.replaceChildren()
      if (drawing?.layer === 'page') {
        paintItems(svg, drawing, t, {
          left: 0,
          top: 0,
          width: t.cssWidth,
          height: t.cssHeight,
        })
      }
    },
    destroy() {
      svg?.remove()
      svg = undefined
    },
  }
}
