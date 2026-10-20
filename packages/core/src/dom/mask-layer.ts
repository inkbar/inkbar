// The mask's dimming: one SVG per page, between the page content (canvas, text layer) and the
// annotation overlay, holding one even-odd path: the whole page, minus the mask's shape. The
// mask annotation's own element (drawn by the overlay) is the shape's outline and takes the
// hits; this layer never does.
//
// Inline styles and attributes are structural: the SVG is `position:absolute; left:0; top:0;
// pointer-events:none` at the page's CSS size, and the path's fill is the mask's colour at its
// `dim`.
import type { PageTransform } from './transform'
import type { MaskAnnotation } from '../model/annotations/types'

const SVG = 'http://www.w3.org/2000/svg'

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000)

/**
 * The path data of a mask's dimming at `t`, in CSS pixels from the page's top-left corner: the
 * page rectangle, then the shape (the rectangle, or the ellipse inscribed in it) as a second
 * subpath that the even-odd rule cuts out. `t.toCssRect` turns the shape's box with the page,
 * so this holds at any /Rotate and view rotation.
 */
export function maskPath(
  a: Pick<MaskAnnotation, 'rect' | 'shape'>,
  t: Pick<PageTransform, 'toCssRect' | 'cssWidth' | 'cssHeight'>
): string {
  const w = t.cssWidth
  const h = t.cssHeight
  const page = `M0 0L${fmt(w)} 0L${fmt(w)} ${fmt(h)}L0 ${fmt(h)}Z`
  const { left, top, width, height } = t.toCssRect(a.rect)
  if (a.shape === 'ellipse') {
    const rx = width / 2
    const ry = height / 2
    const cy = top + ry
    const arc = `A${fmt(rx)} ${fmt(ry)} 0 1 0`
    return `${page}M${fmt(left)} ${fmt(cy)}${arc} ${fmt(left + width)} ${fmt(cy)}${arc} ${fmt(left)} ${fmt(cy)}Z`
  }
  const right = left + width
  const bottom = top + height
  return `${page}M${fmt(left)} ${fmt(top)}L${fmt(right)} ${fmt(top)}L${fmt(right)} ${fmt(bottom)}L${fmt(left)} ${fmt(bottom)}Z`
}

export interface MaskLayer {
  /** Draws `mask` at `t`, or removes the layer when there is none. */
  update(mask: MaskAnnotation | undefined, t: PageTransform): void
  destroy(): void
}

/** The page's mask layer: its SVG goes into `host` just before `before`, the annotation overlay. */
export function createMaskLayer(host: HTMLElement, before: Node): MaskLayer {
  let svg: SVGSVGElement | undefined
  let path: SVGPathElement | undefined

  return {
    update(mask, t) {
      if (!mask) {
        svg?.remove()
        svg = undefined
        path = undefined
        return
      }
      if (!svg || !path) {
        const doc = host.ownerDocument
        svg = doc.createElementNS(SVG, 'svg')
        svg.classList.add('ink-mask-layer')
        svg.dataset.inkMaskLayer = ''
        svg.setAttribute('aria-hidden', 'true')
        svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;'
        path = doc.createElementNS(SVG, 'path')
        path.setAttribute('fill-rule', 'evenodd')
        path.setAttribute('clip-rule', 'evenodd')
        path.setAttribute('stroke', 'none')
        svg.append(path)
      }
      if (svg.parentNode !== host || svg.nextSibling !== before)
        host.insertBefore(svg, before)
      svg.setAttribute('width', String(t.cssWidth))
      svg.setAttribute('height', String(t.cssHeight))
      svg.setAttribute('viewBox', `0 0 ${t.cssWidth} ${t.cssHeight}`)
      path.setAttribute('d', maskPath(mask, t))
      path.setAttribute('fill', mask.color)
      path.setAttribute('fill-opacity', String(mask.dim))
    },
    destroy() {
      svg?.remove()
      svg = undefined
      path = undefined
    },
  }
}
