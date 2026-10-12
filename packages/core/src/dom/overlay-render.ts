import type { CssRect, PageTransform } from './transform'
import type { Annotation } from '../model/annotations/types'
import type { Point, Quad } from '../model/geometry'

const SVG = 'http://www.w3.org/2000/svg'

/**
 * The CSS box an annotation's element occupies. Usually `toCssRect(a.rect)`; stroked paths
 * (lines, polylines, polygons, ink) are padded by half their stroke width on every side, at
 * least 1px in all, so a horizontal or vertical line, whose rect has no height or width,
 * still has a box to draw and hit-test in.
 */
export function annotationBox(a: Annotation, t: PageTransform): CssRect {
  const box = t.toCssRect(a.rect)
  if (
    a.type !== 'line' &&
    a.type !== 'polyline' &&
    a.type !== 'polygon' &&
    a.type !== 'ink'
  )
    return box
  const pad = Math.max(t.toCssLength(a.strokeWidth), 1) / 2
  return {
    left: box.left - pad,
    top: box.top - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  }
}

/**
 * Draws the default visual for an annotation inside its positioned element. Coordinates are
 * relative to the element. Colour, opacity and stroke are SVG attributes, never inline style,
 * so a theme can override them with CSS.
 */
export function renderAnnotationContent(
  el: HTMLElement,
  a: Annotation,
  t: PageTransform
): void {
  const doc = el.ownerDocument
  el.replaceChildren()
  const box = annotationBox(a, t)
  const local = (p: Point): string => {
    const c = t.toCss(p)
    return `${c.x - box.left},${c.y - box.top}`
  }
  const node = (name: string, attrs: Record<string, string | number>): SVGElement => {
    const n = doc.createElementNS(SVG, name)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
    return n
  }

  if (a.type === 'note') {
    // The note's box is its shape: a transparent rect takes the hits, the icon is theme art.
    const svg = boxSvg(doc, box.width, box.height)
    const hit = node('rect', {
      x: 0,
      y: 0,
      width: box.width,
      height: box.height,
      fill: 'transparent',
      stroke: 'none',
      'pointer-events': 'all',
    })
    hit.classList.add('ink-note-box')
    svg.append(hit)
    const icon = doc.createElement('span')
    icon.className = 'ink-note-icon'
    icon.dataset.icon = a.icon
    el.append(svg, icon)
    return
  }
  if (a.type === 'freeText') {
    // HTML rather than SVG <text>: a text box must wrap, and SVG text does not. Font size,
    // colour and opacity travel as custom properties the theme reads; alignment as an attribute.
    const text = doc.createElement('div')
    text.className = 'ink-free-text'
    text.textContent = a.text
    text.dataset.align = a.align
    text.style.setProperty('--ink-font-size', `${t.toCssLength(a.fontSize)}px`)
    text.style.setProperty('--ink-text-color', a.color)
    text.style.setProperty('--ink-opacity', String(a.opacity))
    text.style.setProperty('--ink-font-family', cssString(a.fontFamily))
    // Structural: the element itself ignores the pointer, the text box takes it.
    text.style.pointerEvents = 'auto'
    el.append(text)
    return
  }

  const svg = boxSvg(doc, box.width, box.height)
  svg.classList.add('ink-annotation-shape')

  switch (a.type) {
    case 'highlight':
      for (const q of a.quads) {
        svg.append(
          node('polygon', {
            points: quadPoints(q).map(local).join(' '),
            fill: a.color,
            'fill-opacity': a.opacity,
          })
        )
      }
      break
    case 'underline':
    case 'strikeout':
    case 'squiggly':
      svg.setAttribute('opacity', String(a.opacity))
      for (const q of a.quads) {
        const pts = markupLine(a.type, q)
        svg.append(
          node('polyline', {
            points: pts.map(local).join(' '),
            fill: 'none',
            stroke: a.color,
            'stroke-width': t.toCssLength(markupStroke(q)),
          })
        )
      }
      break
    case 'redact': {
      const shapes = a.quads
        ? a.quads.map((q) =>
            node('polygon', { points: quadPoints(q).map(local).join(' ') })
          )
        : [node('rect', { x: 0, y: 0, width: box.width, height: box.height })]
      for (const s of shapes) {
        s.setAttribute('fill', a.fill)
        s.setAttribute('fill-opacity', '0.15')
        s.setAttribute('stroke', a.color)
        s.setAttribute('stroke-width', String(t.toCssLength(1)))
        svg.append(s)
      }
      svg.setAttribute('opacity', String(a.opacity))
      break
    }
    case 'square':
    case 'circle': {
      const sw = t.toCssLength(a.strokeWidth)
      const shape =
        a.type === 'square'
          ? node('rect', {
              x: sw / 2,
              y: sw / 2,
              width: Math.max(0, box.width - sw),
              height: Math.max(0, box.height - sw),
            })
          : node('ellipse', {
              cx: box.width / 2,
              cy: box.height / 2,
              rx: Math.max(0, box.width / 2 - sw / 2),
              ry: Math.max(0, box.height / 2 - sw / 2),
            })
      shape.setAttribute('fill', a.fill ?? 'none')
      shape.setAttribute('stroke', a.color)
      shape.setAttribute('stroke-width', String(sw))
      svg.append(shape)
      svg.setAttribute('opacity', String(a.opacity))
      break
    }
    case 'line':
    case 'polyline':
    case 'polygon': {
      const pts = a.type === 'line' ? [a.start, a.end] : a.vertices
      svg.append(
        node(a.type === 'polygon' ? 'polygon' : 'polyline', {
          points: pts.map(local).join(' '),
          fill: a.type === 'polygon' ? (a.fill ?? 'none') : 'none',
          stroke: a.color,
          'stroke-width': t.toCssLength(a.strokeWidth),
          'stroke-linejoin': 'round',
        })
      )
      svg.setAttribute('opacity', String(a.opacity))
      break
    }
    case 'ink':
      for (const path of a.paths) {
        svg.append(
          node('polyline', {
            points: path.map(local).join(' '),
            fill: 'none',
            stroke: a.color,
            'stroke-width': t.toCssLength(a.strokeWidth),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          })
        )
      }
      svg.setAttribute('opacity', String(a.opacity))
      break
  }
  // Hits follow the painted shape, so a press beside it reaches the text layer underneath.
  for (const shape of svg.children) shape.setAttribute('pointer-events', 'visiblePainted')
  el.append(svg)
}

/**
 * An invisible hit area for an annotation the overlay does not draw (embedded ones, which
 * PDF.js paints on the canvas): polygons over its quads, or its rect. Selection chrome only.
 */
export function renderHitArea(el: HTMLElement, a: Annotation, t: PageTransform): void {
  const doc = el.ownerDocument
  el.replaceChildren()
  const box = annotationBox(a, t)
  const svg = boxSvg(doc, box.width, box.height)
  svg.dataset.inkHit = ''
  const quads = 'quads' in a && a.quads ? a.quads : undefined
  const shapes = quads
    ? quads.map((q) => {
        const poly = doc.createElementNS(SVG, 'polygon')
        poly.setAttribute(
          'points',
          quadPoints(q)
            .map((p) => {
              const c = t.toCss(p)
              return `${c.x - box.left},${c.y - box.top}`
            })
            .join(' ')
        )
        return poly
      })
    : [doc.createElementNS(SVG, 'rect')]
  for (const shape of shapes) {
    if (shape.tagName === 'rect') {
      shape.setAttribute('width', String(box.width))
      shape.setAttribute('height', String(box.height))
    }
    shape.setAttribute('fill', 'transparent')
    shape.setAttribute('stroke', 'none')
    shape.setAttribute('pointer-events', 'all')
    svg.append(shape)
  }
  el.append(svg)
}

function boxSvg(doc: Document, width: number, height: number): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg')
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('overflow', 'visible')
  // Block, not inline: an inline SVG sits on the text baseline and drifts below a short box.
  // The theme positions it absolutely as well.
  svg.setAttribute('display', 'block')
  svg.setAttribute('aria-hidden', 'true')
  return svg
}

/** Quad corners in drawing order: p1 top-left, p2 top-right, p4 bottom-right, p3 bottom-left. */
function quadPoints(q: Quad): Point[] {
  return [q.p1, q.p2, q.p4, q.p3]
}

const lerp = (a: Point, b: Point, f: number): Point => ({
  x: a.x + (b.x - a.x) * f,
  y: a.y + (b.y - a.y) * f,
})
const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)

/** Line thickness in points for a text markup: a fraction of the quad's height. */
function markupStroke(q: Quad): number {
  return Math.max(0.5, dist(q.p1, q.p3) / 14)
}

/** The stroke for an underline, strikeout or squiggly, in user space. */
function markupLine(type: 'underline' | 'strikeout' | 'squiggly', q: Quad): Point[] {
  if (type === 'strikeout') return [lerp(q.p1, q.p3, 0.5), lerp(q.p2, q.p4, 0.5)]
  const height = dist(q.p1, q.p3)
  // The baseline sits a little above the quad's bottom edge.
  const start = lerp(q.p3, q.p1, 0.1)
  const end = lerp(q.p4, q.p2, 0.1)
  if (type === 'underline') return [start, end]
  const length = dist(start, end)
  const amp = Math.max(0.5, height / 16)
  const step = amp * 2
  const steps = Math.max(1, Math.round(length / step))
  // Unit normal pointing from the bottom edge towards the top edge.
  const up = {
    x: (q.p1.x - q.p3.x) / (height || 1),
    y: (q.p1.y - q.p3.y) / (height || 1),
  }
  const pts: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const p = lerp(start, end, i / steps)
    const s = i % 2 === 0 ? -amp : amp
    pts.push({ x: p.x + up.x * s, y: p.y + up.y * s })
  }
  return pts
}

/** A CSS string literal, so any PDF font name is a single family name. */
function cssString(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&').replace(/\n/g, '\\a ')}"`
}
