import { calloutStroke, isStandardCallout } from '../model/annotations/callout'
import { isBubble } from '../model/annotations/edit'

import { outlinePath, strokeOutline } from './ink-stroke'
import {
  annotationBox,
  appendCommentMarker,
  appendSelectionFrame,
  boxSvg,
  bubblePath,
  drawable,
  endingKinds,
  freeTextLocalBox,
  hasHitTwin,
  hitPad,
  hitWidth,
  lineEndingPath,
  quadPoints,
  styleFreeText,
} from './overlay-render'
import { normalizeRotation, type CssRect, type PageTransform } from './transform'

import type { Annotation, LineEnding, StampAnnotation } from '../model/annotations/types'
import type { Point, Quad } from '../model/geometry'

const SVG = 'http://www.w3.org/2000/svg'

/** Width in CSS px of the band along a mask's edge that takes presses. */
const MASK_EDGE = 6
/** Width in CSS px of the band straddling a text box's edge, which drags the box. */
const TEXT_EDGE = 6
const lerp = (a: Point, b: Point, f: number): Point => ({
  x: a.x + (b.x - a.x) * f,
  y: a.y + (b.y - a.y) * f,
})
const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)

/** Endings that are solid shapes: filled with the stroke colour. */
const FILLED_ENDINGS: ReadonlySet<LineEnding> = new Set([
  'ClosedArrow',
  'RClosedArrow',
  'Square',
  'Circle',
  'Diamond',
])

/**
 * Draws the default visual for an annotation inside its positioned element. Coordinates are
 * relative to the element. Colour, opacity and stroke are SVG attributes, never inline style,
 * so a theme can override them with CSS.
 */
export function renderReferenceContent(
  el: HTMLElement,
  a: Annotation,
  t: PageTransform
): void {
  const doc = el.ownerDocument
  el.replaceChildren()
  const box = annotationBox(a, t)
  /** A user-space point in element-local CSS px. */
  const at = (p: Point): Point => {
    const c = t.toCss(p)
    return { x: c.x - box.left, y: c.y - box.top }
  }
  const local = (p: Point): string => {
    const c = at(p)
    return `${c.x},${c.y}`
  }
  const node = (name: string, attrs: Record<string, string | number>): SVGElement => {
    const n = doc.createElementNS(SVG, name)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
    return n
  }

  if (a.type === 'text') {
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
  if (a.type === 'freetext') {
    if (isBubble(a)) {
      // One path draws the box and its tail; the text box sits above it with no look of its own.
      const svg = boxSvg(doc, box.width, box.height)
      svg.classList.add('ink-annotation-shape')
      svg.setAttribute('opacity', String(a.opacity))
      const path = node('path', {
        d: bubblePath(a, t),
        fill: a.color ?? 'none',
        stroke: a.width > 0 ? (a.borderColor ?? a.defaultStyle.color) : 'none',
        'stroke-width': t.toCssLength(a.width),
        'stroke-linejoin': 'round',
        'pointer-events': 'visiblePainted',
      })
      path.classList.add('ink-bubble')
      dash(path, a.dashes, t)
      svg.append(path)
      el.append(svg)
    } else if (isStandardCallout(a)) {
      // The leader line runs from the tip to the box, with its ending at the tip.
      const svg = boxSvg(doc, box.width, box.height)
      svg.classList.add('ink-annotation-shape')
      svg.setAttribute('opacity', String(a.opacity))
      const stroke = calloutStroke(a)
      const sw = t.toCssLength(stroke.width)
      const line = node('polyline', {
        points: a.callout.map(local).join(' '),
        fill: 'none',
        stroke: stroke.color,
        'stroke-width': sw,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'butt',
        'pointer-events': 'visiblePainted',
      })
      line.classList.add('ink-callout-line')
      // The leader line is dashed as the box's border is.
      dash(line, a.dashes, t)
      svg.append(line)
      const kind = drawable(a.head)
      const d = lineEndingPath(kind, at(a.callout[0]!), at(a.callout[1]!), sw)
      if (d) {
        const ending = node('path', {
          d,
          fill: FILLED_ENDINGS.has(kind) ? stroke.color : 'none',
          stroke: stroke.color,
          'stroke-width': sw,
          'stroke-linejoin': 'round',
          'stroke-linecap': kind === 'Butt' || kind === 'Slash' ? 'butt' : 'round',
          'pointer-events': 'visiblePainted',
        })
        ending.setAttribute('data-ending', 'head')
        svg.append(ending)
      }
      el.append(svg)
    }
    // HTML rather than SVG <text>: a text box must wrap, and SVG text does not.
    const text = doc.createElement('div')
    text.className = 'ink-free-text'
    text.textContent = a.contents
    styleFreeText(text, a, t)
    if (a.fringe) {
      // Inset from the element, which covers the whole rect.
      const inner = freeTextLocalBox(a, t)
      text.style.position = 'absolute'
      text.style.left = `${inner.left}px`
      text.style.top = `${inner.top}px`
      text.style.width = `${inner.width}px`
      text.style.height = `${inner.height}px`
    }
    // Structural: the element itself ignores the pointer, the text box takes it.
    text.style.pointerEvents = 'auto'
    el.append(text, edgeBand(doc, box, freeTextLocalBox(a, t)))
    appendSelectionFrame(el, a, t)
    return
  }

  if (a.type === 'stamp') {
    el.append(stampImage(doc, a, t, box))
    return
  }

  const svg = boxSvg(doc, box.width, box.height)
  svg.classList.add('ink-annotation-shape')
  /** Invisible wider copies of stroke-only geometry, added once the drawn shapes are. */
  const twins: SVGElement[] = []

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
        s.setAttribute('fill', a.interiorColor)
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
      const sw = t.toCssLength(a.width)
      // The element is the rect plus its hit twin's padding, if it has a twin.
      const pad = hasHitTwin(a) ? hitPad(a, t) : 0
      const w = box.width - pad * 2
      const h = box.height - pad * 2
      const geometry =
        a.type === 'square'
          ? {
              name: 'rect',
              attrs: {
                x: pad + sw / 2,
                y: pad + sw / 2,
                width: Math.max(0, w - sw),
                height: Math.max(0, h - sw),
                ...(a.cornerRadius ? { rx: t.toCssLength(a.cornerRadius) } : {}),
              },
            }
          : {
              name: 'ellipse',
              attrs: {
                cx: box.width / 2,
                cy: box.height / 2,
                rx: Math.max(0, w / 2 - sw / 2),
                ry: Math.max(0, h / 2 - sw / 2),
              },
            }
      const shape = node(geometry.name, geometry.attrs)
      shape.setAttribute('fill', a.interiorColor ?? 'none')
      shape.setAttribute('stroke', a.color)
      shape.setAttribute('stroke-width', String(sw))
      dash(shape, a.dashes, t)
      svg.append(shape)
      if (hasHitTwin(a))
        twins.push(hitTwin(node, geometry.name, geometry.attrs, hitWidth(a, t)))
      svg.setAttribute('opacity', String(a.opacity))
      break
    }
    case 'loupe': {
      // The rim, over the magnified canvas the overlay's loupe layer puts first in the
      // element. Its transparent fill takes presses anywhere on the lens.
      const sw = t.toCssLength(a.width)
      const rim = node('circle', {
        cx: box.width / 2,
        cy: box.height / 2,
        r: Math.max(0, Math.min(box.width, box.height) / 2 - sw / 2),
        fill: 'transparent',
        stroke: sw > 0 ? a.color : 'none',
        'stroke-width': sw,
      })
      rim.classList.add('ink-loupe-rim')
      svg.append(rim)
      svg.setAttribute('opacity', String(a.opacity))
      break
    }
    case 'mask': {
      // The shape's outline as an invisible band just inside the edge: it takes presses on
      // the edge only, so the spotlight stays readable, selectable and annotatable, and the
      // dimmed area outside belongs to the page. The dimming is the mask layer's.
      const inset = MASK_EDGE / 2
      const shape =
        a.shape === 'ellipse'
          ? node('ellipse', {
              cx: box.width / 2,
              cy: box.height / 2,
              rx: Math.max(0, box.width / 2 - inset),
              ry: Math.max(0, box.height / 2 - inset),
            })
          : node('rect', {
              x: inset,
              y: inset,
              width: Math.max(0, box.width - MASK_EDGE),
              height: Math.max(0, box.height - MASK_EDGE),
            })
      shape.setAttribute('fill', 'none')
      shape.setAttribute('stroke', 'transparent')
      shape.setAttribute('stroke-width', String(MASK_EDGE))
      shape.classList.add('ink-mask-shape')
      svg.append(shape)
      break
    }
    case 'line':
    case 'polyline':
    case 'polygon': {
      const pts = a.type === 'line' ? [a.start, a.end] : a.vertices
      const stroked = node(a.type === 'polygon' ? 'polygon' : 'polyline', {
        points: pts.map(local).join(' '),
        fill: a.type === 'polygon' ? (a.interiorColor ?? 'none') : 'none',
        stroke: a.color,
        'stroke-width': t.toCssLength(a.width),
        'stroke-linejoin': 'round',
      })
      dash(stroked, a.dashes, t)
      svg.append(stroked)
      if (hasHitTwin(a)) {
        twins.push(
          hitTwin(
            node,
            stroked.tagName,
            { points: stroked.getAttribute('points')!, 'stroke-linejoin': 'round' },
            hitWidth(a, t)
          )
        )
      }
      const ends = endingKinds(a)
      if (ends && pts.length >= 2) {
        for (const [name, kind, tip, other] of [
          ['head', ends.head, pts[0]!, pts[1]!],
          ['tail', ends.tail, pts[pts.length - 1]!, pts[pts.length - 2]!],
        ] as const) {
          const d = lineEndingPath(kind, at(tip), at(other), t.toCssLength(a.width))
          if (!d) continue
          const ending = node('path', {
            d,
            fill: FILLED_ENDINGS.has(kind) ? a.color : 'none',
            stroke: a.color,
            'stroke-width': t.toCssLength(a.width),
            'stroke-linejoin': 'round',
            // A butt or slash ending is a cut across the line: a round cap would blunt it.
            'stroke-linecap': kind === 'Butt' || kind === 'Slash' ? 'butt' : 'round',
          })
          ending.setAttribute('data-ending', name)
          svg.append(ending)
          twins.push(
            hitTwin(
              node,
              'path',
              { d, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' },
              hitWidth(a, t)
            )
          )
        }
      }
      svg.setAttribute('opacity', String(a.opacity))
      break
    }
    case 'ink':
      // Every stroke is a smoothed filled outline, thinned by pressure when there is some.
      // Dashes do not apply to a filled outline.
      a.inklist.forEach((path, i) => {
        const outline = strokeOutline(
          path.map(at),
          a.pressure?.[i],
          t.toCssLength(a.width)
        )
        svg.append(
          node('path', { class: 'ink-stroke', d: outlinePath(outline), fill: a.color })
        )
        twins.push(
          hitTwin(
            node,
            'polyline',
            {
              points: path.map(local).join(' '),
              'stroke-linejoin': 'round',
              'stroke-linecap': 'round',
            },
            hitWidth(a, t)
          )
        )
      })
      svg.setAttribute('opacity', String(a.opacity))
      break
  }
  // Hits follow the painted shape, so a press beside it reaches the text layer underneath.
  for (const shape of svg.children) shape.setAttribute('pointer-events', 'visiblePainted')
  svg.append(...twins)
  el.append(svg)
  appendCommentMarker(el, a, t)
}

/**
 * An invisible copy of a stroke-only shape's geometry, `width` CSS px wide, that takes
 * presses on the stroke alone (`[data-ink-hit-stroke]`), so a thin line is easy to hit.
 */
function hitTwin(
  node: (name: string, attrs: Record<string, string | number>) => SVGElement,
  name: string,
  attrs: Record<string, string | number>,
  width: number
): SVGElement {
  const twin = node(name, attrs)
  twin.setAttribute('data-ink-hit-stroke', '')
  twin.setAttribute('fill', 'none')
  twin.setAttribute('stroke', 'transparent')
  twin.setAttribute('stroke-width', String(width))
  twin.setAttribute('pointer-events', 'stroke')
  return twin
}

/**
 * The band a press on a free text's edge lands on: an invisible `rect[data-ink-edge]` stroke
 * `TEXT_EDGE` px wide along the text box's edge, half inside it and half out, in its own SVG
 * over the element. A press inside the box edits it; one on the band selects and drags it.
 * It is there whether or not the box draws a border. Geometry only.
 */
function edgeBand(doc: Document, el: CssRect, box: CssRect): SVGSVGElement {
  // A later sibling of the text box, so it paints above it once the theme positions it.
  const svg = boxSvg(doc, el.width, el.height)
  const band = doc.createElementNS(SVG, 'rect')
  band.setAttribute('x', String(box.left))
  band.setAttribute('y', String(box.top))
  band.setAttribute('width', String(box.width))
  band.setAttribute('height', String(box.height))
  band.setAttribute('fill', 'none')
  band.setAttribute('stroke', 'transparent')
  band.setAttribute('stroke-width', String(TEXT_EDGE))
  band.setAttribute('pointer-events', 'stroke')
  band.setAttribute('data-ink-edge', '')
  svg.append(band)
  return svg
}

/**
 * A stamp's `img.ink-stamp`, filling the element's box. The image is upright in user space
 * turned by the stamp's `rotation` (anticlockwise), and the page turns it again on screen
 * (clockwise), so it is drawn turned by the difference: a signature placed against the page's
 * turn reads upright. Size, position and turn are geometry, set inline; the opacity travels as
 * `--ink-opacity` for the theme.
 */
function stampImage(
  doc: Document,
  a: StampAnnotation,
  t: PageTransform,
  box: CssRect
): HTMLImageElement {
  const img = doc.createElement('img')
  img.className = 'ink-stamp'
  img.alt = ''
  img.draggable = false
  img.decoding = 'async'
  img.src = a.imagedata
  const turn = normalizeRotation(t.totalRotation - (a.rotation ?? 0))
  const sideways = turn === 90 || turn === 270
  const width = sideways ? box.height : box.width
  const height = sideways ? box.width : box.height
  img.style.position = 'absolute'
  img.style.left = `${(box.width - width) / 2}px`
  img.style.top = `${(box.height - height) / 2}px`
  img.style.width = `${width}px`
  img.style.height = `${height}px`
  if (turn !== 0) img.style.transform = `rotate(${turn}deg)`
  // Structural: the element itself ignores the pointer, the image takes it.
  img.style.pointerEvents = 'auto'
  img.style.setProperty('--ink-opacity', String(a.opacity))
  return img
}

/** Sets `stroke-dasharray` from a dash pattern in points, scaled to CSS px. */
function dash(
  shape: Element,
  dashes: readonly number[] | undefined,
  t: PageTransform
): void {
  if (!dashes || dashes.length === 0) return
  shape.setAttribute('stroke-dasharray', dashes.map((d) => t.toCssLength(d)).join(' '))
}

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
