import { FONT_STACKS } from './text-fonts'
import { normalizeRotation, type CssRect, type PageTransform } from './transform'

import type {
  DrawItem,
  DrawRole,
  Drawing,
  Paint,
  PathCommand,
} from '../model/annotations/drawing/types'
import type { Point, Rect } from '../model/geometry'

const SVG = 'http://www.w3.org/2000/svg'

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000 + 0)

/**
 * A style attribute value for `declarations` (`name:value`), each with priority `important`: what
 * a drawing paints is inline style that no host rule, `!important` ones included, can change.
 */
export const importantStyle = (declarations: readonly string[]): string =>
  declarations.map((d) => `${d} !important`).join(';')

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
  const svg = doc.createElementNS(SVG, 'svg')
  svg.setAttribute('width', String(box.width))
  svg.setAttribute('height', String(box.height))
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`)
  svg.setAttribute('overflow', 'visible')
  // Block, not inline: an inline SVG sits on the text baseline and drifts below a short box.
  svg.setAttribute('display', 'block')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('ink-annotation-shape')
  paintItems(svg, drawing, t, box)
  // Hits follow the painted shape, so a press beside it reaches what is underneath.
  for (const child of svg.children) top(child as SVGElement)
  el.replaceChildren(svg)
}

/**
 * Appends `drawing`'s items to `svg`, positioned relative to `box` (page CSS px). A `page` item
 * is skipped: whoever owns the lens draws it. A lone group puts its opacity and its role on
 * `svg`; with no lone group the svg is fully opaque. Takes no part in hit testing; `paintDrawing` makes what it draws take presses.
 */
export function paintItems(
  svg: SVGSVGElement,
  drawing: Drawing,
  t: PageTransform,
  box: CssRect
): void {
  const doc = svg.ownerDocument
  const at = (p: Point): Point => {
    const c = t.toCss(p)
    return { x: c.x - box.left, y: c.y - box.top }
  }
  const len = (n: number): number => t.toCssLength(n)

  const items = drawing.items.filter((i) => i.kind !== 'page')
  const only = items.length === 1 ? items[0] : undefined
  if (only?.kind === 'group') {
    svg.setAttribute('opacity', String(only.opacity))
    svg.style.setProperty('opacity', String(only.opacity), 'important')
    // The group is not an element of its own here: its role is the svg's.
    role(svg, only.role)
    for (const item of only.items) svg.append(paintItem(doc, item, t, box, at, len))
  } else {
    // No group, so no opacity of the drawing's own: the svg is drawn whole whatever a rule says.
    svg.style.setProperty('opacity', '1', 'important')
    for (const item of items) svg.append(paintItem(doc, item, t, box, at, len))
  }
  guard(svg, 'svg')
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
      if (turnsDashes(item.paint, t)) {
        out = node('path')
        out.setAttribute('d', pathData(rectOutline(item.rect, item.radius), t, at, len))
        paint(out, item.paint, len)
        break
      }
      out = node('rect')
      const r = rectCss(item.rect, t, origin)
      set(out, { x: r.x, y: r.y, width: r.width, height: r.height })
      if (item.radius) out.setAttribute('rx', String(len(item.radius)))
      paint(out, item.paint, len)
      break
    }
    case 'ellipse': {
      if (turnsDashes(item.paint, t)) {
        out = node('path')
        out.setAttribute('d', pathData(ellipseOutline(item.rect), t, at, len))
        paint(out, item.paint, len)
        break
      }
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
      // Set as style too, with the clip rule, which a host rule could change as well.
      const rule = item.fillRule ?? 'nonzero'
      if (item.fillRule) out.setAttribute('fill-rule', item.fillRule)
      paint(out, item.paint, len)
      out.setAttribute(
        'style',
        `${out.getAttribute('style')};${importantStyle([`fill-rule:${rule}`, `clip-rule:${rule}`])}`
      )
      break
    }
    case 'group': {
      out = node('g')
      out.setAttribute('opacity', String(item.opacity))
      out.setAttribute('style', importantStyle([`opacity:${item.opacity}`]))
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
    case 'text': {
      out = paintText(doc, item, t, origin, at, len)
      break
    }
    case 'page':
      throw new Error('a page item is not an svg element')
  }
  role(out, item.role)
  guard(out, item.kind)
  return out
}

/**
 * Clip path ids: a prefix made once per copy of this module, so two copies on a page (two
 * bundles) or two pages never share one, then a count.
 */
const clipPrefix = `ink-text-clip-${Math.random().toString(36).slice(2, 8)}-`
let clipCount = 0

type TextItem = Extract<DrawItem, { kind: 'text' }>

/**
 * A text as one `<text>` per line (one per piece, for a line with tabs) in a group clipped to
 * `item.clip`. Each line or piece of standard-font text is set to its width from the description,
 * so its letters end where the layout says whatever font the browser found; one with characters
 * outside the standard fonts is not, since its width is an estimate. The lines turn with the
 * view: upright for the page as the file displays it. Fonts and colour are inline style as well as
 * attributes, so a host's rules on the text elements do not restyle them.
 */
function paintText(
  doc: Document,
  item: TextItem,
  t: PageTransform,
  origin: { left: number; top: number },
  at: (p: Point) => Point,
  len: (n: number) => number
): SVGElement {
  const node = (name: string): SVGElement => doc.createElementNS(SVG, name)
  const group = node('g')
  if (item.lines.length === 0) return group
  if (item.clip) {
    const id = `${clipPrefix}${++clipCount}`
    const clip = node('clipPath')
    clip.setAttribute('id', id)
    const r = rectCss(item.clip.rect, t, origin)
    const shape = node('rect')
    set(shape, { x: r.x, y: r.y, width: r.width, height: r.height })
    if (item.clip.radius) shape.setAttribute('rx', String(len(item.clip.radius)))
    guard(shape, 'clip rect')
    clip.append(shape)
    group.append(clip)
    group.setAttribute('clip-path', `url(#${id})`)
  }
  const turn = normalizeRotation(t.totalRotation - item.angle)
  const size = len(item.size)
  const stack = FONT_STACKS[item.font.family]
  const weight = item.font.bold ? 'bold' : 'normal'
  const slant = item.font.italic ? 'italic' : 'normal'
  const textAt = (p: Point): SVGElement => {
    const text = node('text')
    set(text, { x: p.x, y: p.y })
    text.setAttribute('font-family', stack)
    text.setAttribute('font-size', fmt(size))
    text.setAttribute('font-weight', weight)
    text.setAttribute('font-style', slant)
    text.setAttribute('fill', item.color)
    text.setAttribute(
      'style',
      importantStyle([
        'font-kerning:none',
        'white-space:pre',
        `font-family:${stack}`,
        `font-size:${fmt(size)}px`,
        `font-weight:${weight}`,
        `font-style:${slant}`,
        `fill:${item.color}`,
        'stroke:none',
        'text-anchor:start',
        'dominant-baseline:alphabetic',
        'letter-spacing:0',
        'word-spacing:0',
        'text-decoration:none',
      ])
    )
    text.setAttribute('pointer-events', 'none')
    if (turn !== 0)
      text.setAttribute('transform', `rotate(${turn} ${fmt(p.x)} ${fmt(p.y)})`)
    return text
  }
  for (const line of item.lines) {
    const spacing = line.wordSpacing ?? 0
    const gapsIn = (content: string) =>
      spacing ? [...content].filter((c) => c === ' ').length : 0
    const pieces = line.segments ?? [
      { text: line.text, origin: line.origin, width: line.width, outside: line.outside },
    ]
    for (const piece of pieces) {
      const p = at(piece.origin)
      const text = textAt(p)
      fillText(doc, text, piece.text, spacing ? len(spacing) : 0)
      if (!piece.outside) {
        text.setAttribute(
          'textLength',
          fmt(len(piece.width + gapsIn(piece.text) * spacing))
        )
        text.setAttribute('lengthAdjust', 'spacing')
      }
      guard(text, 'text')
      group.append(text)
    }
    if (line.underline) {
      const from = at(line.underline.from)
      const to = at(line.underline.to)
      const rule = node('line')
      set(rule, { x1: from.x, y1: from.y, x2: to.x, y2: to.y })
      rule.setAttribute('stroke', item.color)
      rule.setAttribute('stroke-width', fmt(len(line.underline.thickness)))
      rule.setAttribute(
        'style',
        importantStyle([
          `stroke:${item.color}`,
          `stroke-width:${fmt(len(line.underline.thickness))}px`,
          'stroke-dasharray:none',
          'stroke-linecap:butt',
        ])
      )
      rule.setAttribute('pointer-events', 'none')
      guard(rule, 'underline')
      group.append(rule)
    }
  }
  return group
}

/**
 * Puts `content` in `text`, with `spacing` CSS px added to each U+0020. SVG `word-spacing` also
 * widens U+00A0, which the layout does not, so a no-break space is set apart in a piece of its
 * own that takes none.
 */
function fillText(
  doc: Document,
  text: SVGElement,
  content: string,
  spacing: number
): void {
  if (spacing === 0) {
    text.textContent = content
    return
  }
  text.setAttribute('word-spacing', fmt(spacing))
  text.style.setProperty('word-spacing', `${fmt(spacing)}px`, 'important')
  for (const part of content.split(/(\u00a0+)/)) {
    if (part === '') continue
    if (part.startsWith('\u00a0')) {
      const piece = doc.createElementNS(SVG, 'tspan')
      piece.setAttribute('word-spacing', '0')
      piece.style.setProperty('word-spacing', '0', 'important')
      piece.textContent = part
      text.append(piece)
    } else text.append(doc.createTextNode(part))
  }
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

/**
 * Whether a dashed outline must be drawn as a path. A `<rect>` or `<ellipse>` starts its dashes at
 * the corner or point that is top-left or rightmost on screen, and a description's start is the
 * one in user space as the page is displayed unturned, so a turned view needs a path that starts
 * where the description says.
 */
const turnsDashes = (p: Paint, t: PageTransform): boolean =>
  t.totalRotation !== 0 && (p.stroke?.dashes?.length ?? 0) > 0

/**
 * The outline of a rect from its top-left corner as displayed unturned (the end of that corner's
 * arc, on the top edge, when it is rounded), clockwise as displayed. Arcs turn the same way, which
 * is `sweep: false` in a description.
 */
function rectOutline(rect: Rect, radius = 0): PathCommand[] {
  const { x, y, width, height } = rect
  const r = Math.min(Math.max(0, radius), width / 2, height / 2)
  const [left, right, bottom, top] = [x, x + width, y, y + height]
  const arc = (to: Point): PathCommand[] =>
    r > 0 ? [{ op: 'A', rx: r, ry: r, largeArc: false, sweep: false, to }] : []
  return [
    { op: 'M', to: { x: left + r, y: top } },
    { op: 'L', to: { x: right - r, y: top } },
    ...arc({ x: right, y: top - r }),
    { op: 'L', to: { x: right, y: bottom + r } },
    ...arc({ x: right - r, y: bottom }),
    { op: 'L', to: { x: left + r, y: bottom } },
    ...arc({ x: left, y: bottom + r }),
    { op: 'L', to: { x: left, y: top - r } },
    ...arc({ x: left + r, y: top }),
    { op: 'Z' },
  ]
}

/** The outline of an ellipse from its rightmost point, clockwise as displayed unturned. */
function ellipseOutline(rect: Rect): PathCommand[] {
  const { x, y, width, height } = rect
  const cy = y + height / 2
  const half = (to: number): PathCommand => ({
    op: 'A',
    rx: width / 2,
    ry: height / 2,
    largeArc: true,
    sweep: false,
    to: { x: to, y: cy },
  })
  return [{ op: 'M', to: { x: x + width, y: cy } }, half(x), half(x + width), { op: 'Z' }]
}

/**
 * Sets an item's paint as attributes, which tests and selectors read, and as inline style with
 * priority `important`, which a host's rule on `svg rect` or `path` cannot override. The style names everything such a rule
 * could change, a value the description leaves out as its default: no stroke is `none`, no
 * dashes `none`, a join `miter`, a cap `butt`.
 */
function paint(el: Element, p: Paint, len: (n: number) => number): void {
  const s = p.stroke
  const dashes = s?.dashes?.length ? s.dashes.map(len).join(' ') : undefined
  el.setAttribute('fill', p.fill?.color ?? 'none')
  if (p.fill?.opacity !== undefined)
    el.setAttribute('fill-opacity', String(p.fill.opacity))
  if (s) {
    el.setAttribute('stroke', s.color)
    el.setAttribute('stroke-width', String(len(s.width)))
    if (dashes) el.setAttribute('stroke-dasharray', dashes)
    if (s.join) el.setAttribute('stroke-linejoin', s.join)
    if (s.cap) el.setAttribute('stroke-linecap', s.cap)
  }
  el.setAttribute(
    'style',
    importantStyle([
      `fill:${p.fill?.color ?? 'none'}`,
      `fill-opacity:${p.fill?.opacity ?? 1}`,
      `stroke:${s?.color ?? 'none'}`,
      ...(s ? [`stroke-width:${len(s.width)}px`] : []),
      `stroke-dasharray:${dashes ?? 'none'}`,
      `stroke-linejoin:${s?.join ?? 'miter'}`,
      `stroke-linecap:${s?.cap ?? 'butt'}`,
    ])
  )
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
