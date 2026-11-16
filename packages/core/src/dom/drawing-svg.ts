import { normalizeRotation, type CssRect, type PageTransform } from './transform'

import type {
  DrawItem,
  DrawRole,
  Drawing,
  Paint,
  PathCommand,
} from '../model/annotations/drawing/types'
import type { Point } from '../model/geometry'

const SVG = 'http://www.w3.org/2000/svg'

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000 + 0)

/** Class names and data attributes the overlay, its theme and its tests select on. */
const ROLE_CLASS: Partial<Record<DrawRole, string>> = {
  stroke: 'ink-stroke',
  'callout-line': 'ink-callout-line',
  bubble: 'ink-bubble',
  'loupe-rim': 'ink-loupe-rim',
  stamp: 'ink-stamp',
  note: 'ink-note-icon',
}

/**
 * Paints `drawing` into `el`, replacing its children. `box` is the element's box in page CSS
 * px (`annotationBox`): the `<svg>` takes its size, and item coordinates are relative to its
 * top-left.
 */
export function paintDrawing(
  el: HTMLElement,
  drawing: Drawing,
  t: PageTransform,
  box: CssRect
): void {
  const doc = el.ownerDocument
  const origin = box
  const svg = doc.createElementNS(SVG, 'svg')
  svg.setAttribute('width', String(box.width))
  svg.setAttribute('height', String(box.height))
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`)
  svg.setAttribute('overflow', 'visible')
  // Block, not inline: an inline SVG sits on the text baseline and drifts below a short box.
  svg.setAttribute('display', 'block')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('ink-annotation-shape')

  const at = (p: Point): Point => {
    const c = t.toCss(p)
    return { x: c.x - origin.left, y: c.y - origin.top }
  }
  const len = (n: number): number => t.toCssLength(n)

  const only = drawing.items.length === 1 ? drawing.items[0] : undefined
  if (only?.kind === 'group') {
    svg.setAttribute('opacity', String(only.opacity))
    for (const item of only.items)
      svg.append(top(paintItem(doc, item, t, origin, at, len)))
  } else {
    for (const item of drawing.items)
      svg.append(top(paintItem(doc, item, t, origin, at, len)))
  }
  guard(svg, 'svg')
  el.replaceChildren(svg)
}

/**
 * One drawing item as an SVG element, positioned like `paintDrawing` does for an element whose
 * box is `box`. For chrome that follows a drawn shape's geometry, such as a hit twin.
 */
export function itemElement(
  doc: Document,
  item: DrawItem,
  t: PageTransform,
  box: CssRect
): SVGElement {
  const at = (p: Point): Point => {
    const c = t.toCss(p)
    return { x: c.x - box.left, y: c.y - box.top }
  }
  return paintItem(doc, item, t, box, at, (n) => t.toCssLength(n))
}

function paintItem(
  doc: Document,
  item: DrawItem,
  t: PageTransform,
  origin: { left: number; top: number },
  at: (p: Point) => Point,
  len: (n: number) => number
): SVGElement {
  const node = (name: string): SVGElement => doc.createElementNS(SVG, name)
  let out: SVGElement
  switch (item.kind) {
    case 'polygon':
    case 'polyline': {
      out = node(item.kind)
      out.setAttribute(
        'points',
        item.points
          .map((p) => {
            const c = at(p)
            return `${c.x},${c.y}`
          })
          .join(' ')
      )
      paint(out, item.paint, len)
      break
    }
    case 'rect': {
      out = node('rect')
      const r = rectCss(item.rect, t, origin)
      set(out, { x: r.x, y: r.y, width: r.width, height: r.height })
      if (item.radius) out.setAttribute('rx', String(len(item.radius)))
      paint(out, item.paint, len)
      break
    }
    case 'ellipse': {
      const r = rectCss(item.rect, t, origin)
      if (item.role === 'loupe-rim') {
        out = node('circle')
        set(out, {
          cx: r.x + r.width / 2,
          cy: r.y + r.height / 2,
          r: Math.min(r.width, r.height) / 2,
        })
      } else {
        out = node('ellipse')
        set(out, {
          cx: r.x + r.width / 2,
          cy: r.y + r.height / 2,
          rx: r.width / 2,
          ry: r.height / 2,
        })
      }
      paint(out, item.paint, len)
      break
    }
    case 'path': {
      out = node('path')
      out.setAttribute('d', pathData(item.commands, t, at, len))
      if (item.fillRule) out.setAttribute('fill-rule', item.fillRule)
      paint(out, item.paint, len)
      break
    }
    case 'group': {
      out = node('g')
      out.setAttribute('opacity', String(item.opacity))
      for (const child of item.items)
        out.append(paintItem(doc, child, t, origin, at, len))
      break
    }
    case 'image': {
      // Upright in user space turned by `angle` (anticlockwise); the page turns it again on
      // screen (clockwise), so it is drawn turned by the difference, about the rect's centre.
      out = node('image')
      const r = rectCss(item.rect, t, origin)
      const turn = normalizeRotation(t.totalRotation - item.angle)
      const sideways = turn === 90 || turn === 270
      const width = sideways ? r.height : r.width
      const height = sideways ? r.width : r.height
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      set(out, { x: cx - width / 2, y: cy - height / 2, width, height })
      out.setAttribute('href', item.data)
      out.setAttribute('preserveAspectRatio', 'none')
      if (turn !== 0)
        out.setAttribute('transform', `rotate(${turn} ${fmt(cx)} ${fmt(cy)})`)
      break
    }
    case 'text':
    case 'page':
      throw new Error(`painting a ${item.kind} is not supported yet`)
  }
  role(out, item.role)
  guard(out, item.kind)
  return out
}

/** Hits follow the painted shape, so a press beside it reaches what is underneath. */
function top(el: SVGElement): SVGElement {
  el.setAttribute('pointer-events', 'visiblePainted')
  return el
}

function guard(el: Element, what: string): void {
  for (const attr of el.attributes) {
    // An image's data URL is base64, which can spell "NaN" by chance.
    if (attr.name === 'href' && el.localName === 'image') continue
    if (/NaN|Infinity/.test(attr.value)) {
      throw new RangeError(`${what} has a non-finite value in ${attr.name}`)
    }
  }
}

function set(el: Element, attrs: Record<string, number>): void {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
}

/** A user-space rect as element-local CSS px. */
function rectCss(
  r: { x: number; y: number; width: number; height: number },
  t: PageTransform,
  origin: { left: number; top: number }
): { x: number; y: number; width: number; height: number } {
  const c = t.toCssRect(r)
  return {
    x: c.left - origin.left,
    y: c.top - origin.top,
    width: c.width,
    height: c.height,
  }
}

function role(el: Element, r: DrawRole | undefined): void {
  if (!r) return
  const cls = ROLE_CLASS[r]
  if (cls) el.classList.add(cls)
  else if (r === 'ending-head') el.setAttribute('data-ending', 'head')
  else if (r === 'ending-tail') el.setAttribute('data-ending', 'tail')
  else el.setAttribute('data-ink-part', r)
}

function paint(el: Element, p: Paint, len: (n: number) => number): void {
  el.setAttribute('fill', p.fill?.color ?? 'none')
  if (p.fill?.opacity !== undefined)
    el.setAttribute('fill-opacity', String(p.fill.opacity))
  const s = p.stroke
  if (!s) return
  el.setAttribute('stroke', s.color)
  el.setAttribute('stroke-width', String(len(s.width)))
  if (s.dashes && s.dashes.length > 0) {
    el.setAttribute('stroke-dasharray', s.dashes.map(len).join(' '))
  }
  if (s.join) el.setAttribute('stroke-linejoin', s.join)
  if (s.cap) el.setAttribute('stroke-linecap', s.cap)
}

function pathData(
  commands: readonly PathCommand[],
  t: PageTransform,
  at: (p: Point) => Point,
  len: (n: number) => number
): string {
  const pt = (p: Point): string => {
    const c = at(p)
    return `${fmt(c.x)} ${fmt(c.y)}`
  }
  // The page transform contains one reflection, which turns every arc the other way, and a
  // quarter turn swaps which axis each radius lies along.
  const swap = t.totalRotation === 90 || t.totalRotation === 270
  return commands
    .map((c) => {
      switch (c.op) {
        case 'M':
        case 'L':
          return `${c.op}${pt(c.to)}`
        case 'C':
          return `C${pt(c.c1)} ${pt(c.c2)} ${pt(c.to)}`
        case 'A': {
          const rx = len(swap ? c.ry : c.rx)
          const ry = len(swap ? c.rx : c.ry)
          return `A${fmt(rx)} ${fmt(ry)} 0 ${c.largeArc ? 1 : 0} ${c.sweep ? 0 : 1} ${pt(c.to)}`
        }
        case 'Z':
          return 'Z'
      }
    })
    .join('')
}
