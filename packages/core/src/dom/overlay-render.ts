import { isBubble } from '../model/annotations/edit'

import type { CssRect, PageTransform } from './transform'
import type {
  Annotation,
  FreeTextAnnotation,
  LineEnding,
} from '../model/annotations/types'
import type { Point, Quad } from '../model/geometry'

const SVG = 'http://www.w3.org/2000/svg'

/** Side of an edit handle, CSS px. */
const HANDLE_PX = 8
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const

/**
 * Which edit handles an element shows: none, the four CSS corners of its box (`nw`, `ne`,
 * `sw`, `se`), or a line's two ends (`start`, `end`, element-local CSS px).
 */
export type HandleSpec =
  | { kind: 'none' }
  | {
      kind: 'corners'
      width: number
      height: number
      /** A speech bubble's tail tip (element-local CSS px): one more handle, `callout`. */
      tail?: Point
    }
  | { kind: 'ends'; start: Point; end: Point }

/**
 * Syncs an element's edit handles (`.ink-handle[data-handle]`) with `spec`. Each is an 8px
 * `position:absolute; pointer-events:auto` box centred on its point; its look is the theme's.
 */
export function syncHandles(node: HTMLElement, spec: HandleSpec): void {
  const existing = [...node.querySelectorAll<HTMLElement>(':scope > [data-handle]')]
  const names: readonly string[] =
    spec.kind === 'none'
      ? []
      : spec.kind === 'ends'
        ? ['start', 'end']
        : spec.tail
          ? [...CORNERS, 'callout']
          : CORNERS
  if (
    existing.length !== names.length ||
    existing.some((h, i) => h.dataset.handle !== names[i])
  ) {
    existing.forEach((h) => h.remove())
    existing.length = 0
    for (const name of names) {
      const h = node.ownerDocument.createElement('div')
      h.className = 'ink-handle'
      h.dataset.handle = name
      h.setAttribute('aria-hidden', 'true')
      h.style.cssText = `position:absolute;width:${HANDLE_PX}px;height:${HANDLE_PX}px;pointer-events:auto;`
      node.append(h)
      existing.push(h)
    }
  }
  for (const h of existing) {
    const name = h.dataset.handle!
    const at =
      spec.kind === 'ends'
        ? name === 'start'
          ? spec.start
          : spec.end
        : spec.kind === 'corners'
          ? name === 'callout' && spec.tail
            ? spec.tail
            : {
                x: name[1] === 'w' ? 0 : spec.width,
                y: name[0] === 'n' ? 0 : spec.height,
              }
          : { x: 0, y: 0 }
    h.style.left = `${at.x - HANDLE_PX / 2}px`
    h.style.top = `${at.y - HANDLE_PX / 2}px`
  }
}

/**
 * The CSS box an annotation's default visual occupies. Usually `toCssRect(a.rect)`. Stroked
 * paths (lines, polylines, polygons, ink) use the bounds of their own points instead of
 * `rect` (which may already carry stroke padding, as a derived ink rect does), padded once by
 * half their stroke width on every side, at least 1px in all, so a horizontal or vertical
 * line still has a box to draw and hit-test in. Custom elements do not use this: they sit on
 * `toCssRect(a.rect)`.
 */
export function annotationBox(a: Annotation, t: PageTransform): CssRect {
  const points =
    a.type === 'line'
      ? [a.start, a.end]
      : a.type === 'polyline' || a.type === 'polygon'
        ? a.vertices
        : a.type === 'ink'
          ? a.inklist.flat()
          : undefined
  if (!points || points.length === 0 || !('width' in a)) return t.toCssRect(a.rect)
  const box = t.toCssRect(pointBounds(points))
  const stroke = Math.max(t.toCssLength(a.width), 1)
  // Endings reach up to ENDING_SCALE strokes either side of their end.
  const pad = hasEndings(a) ? ENDING_SCALE * stroke : stroke / 2
  return {
    left: box.left - pad,
    top: box.top - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  }
}

/** An ending's length, and its full width, as a multiple of the stroke width. */
const ENDING_SCALE = 3

function endingKinds(a: Annotation): { head: LineEnding; tail: LineEnding } | undefined {
  return a.type === 'line' || a.type === 'polyline'
    ? { head: a.head ?? 'none', tail: a.tail ?? 'none' }
    : undefined
}

function hasEndings(a: Annotation): boolean {
  const e = endingKinds(a)
  return e !== undefined && (e.head !== 'none' || e.tail !== 'none')
}

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000 + 0)

/**
 * SVG path data for a line ending at `at`, in the caller's coordinates (CSS px). `from` is the
 * other end of the segment the ending sits on, so the ending points from `from` towards `at`.
 * Sized from the stroke `width` (at least 1): arrows are 3 strokes long, the rest 3 across.
 * Returns an empty string for `none` or a zero-length segment.
 */
export function lineEndingPath(
  kind: LineEnding,
  at: Point,
  from: Point,
  width: number
): string {
  const len = Math.hypot(at.x - from.x, at.y - from.y)
  if (kind === 'none' || len === 0) return ''
  const size = ENDING_SCALE * Math.max(width, 1)
  const half = size / 2
  const dx = (at.x - from.x) / len
  const dy = (at.y - from.y) / len
  // Unit normal, 90 degrees clockwise on screen.
  const nx = -dy
  const ny = dx
  const pt = (along: number, across: number, o: Point = at): string =>
    `${fmt(o.x + dx * along + nx * across)} ${fmt(o.y + dy * along + ny * across)}`
  switch (kind) {
    case 'openArrow':
      return `M${pt(-size, -half)}L${pt(0, 0)}L${pt(-size, half)}`
    case 'closedArrow':
      return `M${pt(-size, -half)}L${pt(0, 0)}L${pt(-size, half)}Z`
    case 'square':
      return `M${pt(-half, -half)}L${pt(half, -half)}L${pt(half, half)}L${pt(-half, half)}Z`
    case 'diamond':
      return `M${pt(-half, 0)}L${pt(0, -half)}L${pt(half, 0)}L${pt(0, half)}Z`
    case 'circle':
      return `M${pt(half, 0)}A${fmt(half)} ${fmt(half)} 0 1 0 ${pt(-half, 0)}A${fmt(half)} ${fmt(half)} 0 1 0 ${pt(half, 0)}Z`
    case 'butt':
      return `M${pt(0, -half)}L${pt(0, half)}`
    case 'slash': {
      // Tilted 30 degrees from the butt, as PDF draws it.
      const s = Math.sin(Math.PI / 6) * half
      const c = Math.cos(Math.PI / 6) * half
      return `M${pt(-s, -c)}L${pt(s, c)}`
    }
  }
}

/** Endings that are solid shapes: filled with the stroke colour. */
const FILLED_ENDINGS: ReadonlySet<LineEnding> = new Set([
  'closedArrow',
  'square',
  'circle',
  'diamond',
])

function pointBounds(points: readonly Point[]): {
  x: number
  y: number
  width: number
  height: number
} {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
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
        d: bubblePath(a, t, box.width, box.height),
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
    }
    // HTML rather than SVG <text>: a text box must wrap, and SVG text does not.
    const text = doc.createElement('div')
    text.className = 'ink-free-text'
    text.textContent = a.contents
    styleFreeText(text, a, t)
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
      const shape =
        a.type === 'square'
          ? node('rect', {
              x: sw / 2,
              y: sw / 2,
              width: Math.max(0, box.width - sw),
              height: Math.max(0, box.height - sw),
              ...(a.cornerRadius ? { rx: t.toCssLength(a.cornerRadius) } : {}),
            })
          : node('ellipse', {
              cx: box.width / 2,
              cy: box.height / 2,
              rx: Math.max(0, box.width / 2 - sw / 2),
              ry: Math.max(0, box.height / 2 - sw / 2),
            })
      shape.setAttribute('fill', a.interiorColor ?? 'none')
      shape.setAttribute('stroke', a.color)
      shape.setAttribute('stroke-width', String(sw))
      dash(shape, a.dashes, t)
      svg.append(shape)
      svg.setAttribute('opacity', String(a.opacity))
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
      const ends = endingKinds(a)
      if (ends && pts.length >= 2) {
        const first = t.toCss(pts[0]!)
        const second = t.toCss(pts[1]!)
        const last = t.toCss(pts[pts.length - 1]!)
        const prev = t.toCss(pts[pts.length - 2]!)
        const at = (p: Point): Point => ({ x: p.x - box.left, y: p.y - box.top })
        for (const [name, kind, tip, other] of [
          ['head', ends.head, first, second],
          ['tail', ends.tail, last, prev],
        ] as const) {
          const d = lineEndingPath(kind, at(tip), at(other), t.toCssLength(a.width))
          if (!d) continue
          const ending = node('path', {
            d,
            fill: FILLED_ENDINGS.has(kind) ? a.color : 'none',
            stroke: a.color,
            'stroke-width': t.toCssLength(a.width),
            'stroke-linejoin': 'round',
            'stroke-linecap': 'round',
          })
          ending.setAttribute('data-ending', name)
          svg.append(ending)
        }
      }
      svg.setAttribute('opacity', String(a.opacity))
      break
    }
    case 'ink':
      for (const path of a.inklist) {
        svg.append(
          node('polyline', {
            points: path.map(local).join(' '),
            fill: 'none',
            stroke: a.color,
            'stroke-width': t.toCssLength(a.width),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          })
        )
        dash(svg.lastElementChild as SVGElement, a.dashes, t)
      }
      svg.setAttribute('opacity', String(a.opacity))
      break
  }
  // Hits follow the painted shape, so a press beside it reaches the text layer underneath.
  for (const shape of svg.children) shape.setAttribute('pointer-events', 'visiblePainted')
  el.append(svg)
}

/**
 * Styles a free-text box (`.ink-free-text`) from its annotation, as the theme reads it: the text
 * style, fill, border colour and width, corner radius and opacity travel as custom properties
 * (`--ink-font-size`, `--ink-font-family`, `--ink-font-weight`, `--ink-font-style`,
 * `--ink-text-decoration`, `--ink-text-color`, `--ink-fill`, `--ink-border`,
 * `--ink-border-width`, `--ink-corner-radius`, `--ink-opacity`); alignment as `data-align`,
 * and a border as `data-border` (`solid` or `dashed`, absent at width 0). Lengths are scaled to
 * CSS px. Shared by the overlay and the in-place editor, so both look the same.
 */
export function styleFreeText(
  node: HTMLElement,
  a: FreeTextAnnotation,
  t: PageTransform
): void {
  const s = a.defaultStyle
  const set = (name: string, value: string | undefined): void => {
    if (value === undefined) node.style.removeProperty(name)
    else node.style.setProperty(name, value)
  }
  set('--ink-font-size', `${t.toCssLength(s.fontSize)}px`)
  set('--ink-font-family', cssString(s.fontFamily))
  set('--ink-font-weight', s.fontWeight)
  set('--ink-font-style', s.fontStyle)
  set('--ink-text-decoration', s.textDecoration)
  set('--ink-text-color', s.color)
  // A speech bubble's outline and fill are drawn by its path, not by the text box.
  const bubble = isBubble(a)
  set('--ink-fill', bubble ? undefined : a.color)
  set('--ink-border', bubble ? undefined : a.borderColor)
  set(
    '--ink-border-width',
    !bubble && a.width > 0 ? `${t.toCssLength(a.width)}px` : undefined
  )
  set(
    '--ink-corner-radius',
    !bubble && a.cornerRadius ? `${t.toCssLength(a.cornerRadius)}px` : undefined
  )
  set('--ink-opacity', String(a.opacity))
  node.dataset.align = s.textAlign
  if (bubble) node.dataset.bubble = ''
  else delete node.dataset.bubble
  if (!bubble && a.width > 0) node.dataset.border = a.dashes?.length ? 'dashed' : 'solid'
  else delete node.dataset.border
}

/** Half the width of a bubble tail where it leaves the box, points. */
const BUBBLE_TAIL_HALF = 8

/**
 * The outline of a speech bubble as SVG path data in element-local CSS px: the rounded box
 * (`width` x `height`, its top-left at 0,0) with the tail to `callout[0]`. The tail leaves the
 * side the tip lies furthest beyond, at the position of `callout[1]` along that side, kept
 * clear of the corners. A `height` beyond the rect's moves the tail down with the bottom edge.
 */
export function bubblePath(
  a: FreeTextAnnotation & { callout: readonly Point[] },
  t: PageTransform,
  width: number,
  height: number
): string {
  const origin = t.toCssRect(a.rect)
  const local = (p: Point): Point => {
    const c = t.toCss(p)
    return { x: c.x - origin.left, y: c.y - origin.top }
  }
  // A box grown past its rect (the editor growing with its text) carries its tail down with it.
  const grown = height - origin.height
  const moved = (p: Point): Point => ({ x: p.x, y: p.y + grown })
  const tip = moved(local(a.callout[0]!))
  const knee = moved(local(a.callout[1]!))
  const r = Math.min(t.toCssLength(a.cornerRadius ?? 0), width / 2, height / 2)
  const beyond = {
    top: -tip.y,
    right: tip.x - width,
    bottom: tip.y - height,
    left: -tip.x,
  }
  const side = (Object.keys(beyond) as (keyof typeof beyond)[]).reduce((best, s) =>
    beyond[s] > beyond[best] ? s : best
  )
  const along = side === 'top' || side === 'bottom' ? width : height
  const half = Math.min(t.toCssLength(BUBBLE_TAIL_HALF), along / 4)
  const lo = Math.min(r + half, along / 2)
  const at = Math.min(
    Math.max(side === 'top' || side === 'bottom' ? knee.x : knee.y, lo),
    along - lo
  )
  const P = (x: number, y: number): string => `${fmt(x)} ${fmt(y)}`
  const arc = (x: number, y: number): string =>
    r > 0 ? `A${fmt(r)} ${fmt(r)} 0 0 1 ${P(x, y)}` : ''
  const spike = (x: number, y: number): string => `L${P(x, y)}L${P(tip.x, tip.y)}`
  const w = width
  const h = height
  return [
    `M${P(r, 0)}`,
    side === 'top' ? `${spike(at - half, 0)}L${P(at + half, 0)}` : '',
    `L${P(w - r, 0)}${arc(w, r)}`,
    side === 'right' ? `${spike(w, at - half)}L${P(w, at + half)}` : '',
    `L${P(w, h - r)}${arc(w - r, h)}`,
    side === 'bottom' ? `${spike(at + half, h)}L${P(at - half, h)}` : '',
    `L${P(r, h)}${arc(0, h - r)}`,
    side === 'left' ? `${spike(0, at + half)}L${P(0, at - half)}` : '',
    `L${P(0, r)}${arc(r, 0)}Z`,
  ].join('')
}

/**
 * Redraws an open bubble's outline for a box grown to `height` CSS px, as the editor grows it
 * with its text. No-op on any other element.
 */
export function refitBubble(
  el: HTMLElement,
  a: FreeTextAnnotation,
  t: PageTransform,
  height: number
): void {
  const path = el.querySelector(':scope > svg > .ink-bubble')
  if (!path || !isBubble(a)) return
  const width = t.toCssRect(a.rect).width
  path.setAttribute('d', bubblePath(a, t, width, height))
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
