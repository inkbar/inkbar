import { ICON_ATTRIBUTES, MessageSquareText } from '@inkbar/icons'

import { freeTextBox } from '../model/annotations/callout'
import { isTextMarkup } from '../model/annotations/edit'

import { drawingFor } from './drawing-context'
import { itemElement, paintDrawing } from './drawing-svg'
import { type CssRect, type PageTransform } from './transform'

import type { DrawItem } from '../model/annotations/drawing/types'
import type {
  Annotation,
  FreeTextAnnotation,
  NoteAnnotation,
  TextMarkupAnnotation,
} from '../model/annotations/types'
import type { Point, Quad } from '../model/geometry'

const SVG = 'http://www.w3.org/2000/svg'

/** Side of an edit handle, CSS px. */
const HANDLE_PX = 8
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const

/**
 * Which edit handles an element shows: none, the four CSS corners of a box (`nw`, `ne`, `sw`,
 * `se`), or a line's two ends (`start`, `end`), all element-local CSS px.
 */
export type HandleSpec =
  | { kind: 'none' }
  | {
      kind: 'corners'
      /** The box's top-left corner; 0,0 (the element's own) when absent. */
      left?: number
      top?: number
      width: number
      height: number
      /** A callout's tip: one more handle, `callout`. */
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
                x: (spec.left ?? 0) + (name[1] === 'w' ? 0 : spec.width),
                y: (spec.top ?? 0) + (name[0] === 'n' ? 0 : spec.height),
              }
          : { x: 0, y: 0 }
    h.style.left = `${at.x - HANDLE_PX / 2}px`
    h.style.top = `${at.y - HANDLE_PX / 2}px`
  }
}

/**
 * Gives a press-taking shape its paint (`transparent` or `none`) as attributes and as inline
 * style, so a host rule such as `svg rect { fill: currentColor }` cannot fill or outline it and
 * cover what is drawn under it. `width` is the stroke's, in CSS px. Hit testing
 * (`pointer-events`) is the caller's.
 */
function invisible(
  el: Element,
  fill: 'transparent' | 'none',
  stroke: 'transparent' | 'none',
  width?: number
): void {
  el.setAttribute('fill', fill)
  el.setAttribute('stroke', stroke)
  if (width !== undefined) el.setAttribute('stroke-width', String(width))
  el.setAttribute(
    'style',
    `fill:${fill};stroke:${stroke}${width === undefined ? '' : `;stroke-width:${width}px`}`
  )
}

/** Width in CSS px a thin stroke's invisible hit twin is widened to. */
const HIT_STROKE = 8

/**
 * True when `a` is drawn as a stroke alone (a line, polyline, ink, or an unfilled square,
 * circle or polygon with a border), so a press beside the stroke would miss it. These get an
 * invisible, wider hit twin of their geometry.
 */
function hasHitTwin(a: Annotation): boolean {
  switch (a.type) {
    case 'line':
    case 'polyline':
    case 'ink':
      return true
    case 'polygon':
    case 'square':
    case 'circle':
      return a.interiorColor === undefined && a.width > 0
    default:
      return false
  }
}

/** The width in CSS px of `a`'s hit twin: 8px, or the drawn stroke if that is wider. */
function hitWidth(a: Annotation, t: PageTransform): number {
  return Math.max(HIT_STROKE, 'width' in a ? t.toCssLength(a.width) : 0)
}

/**
 * The CSS box an annotation's default visual occupies. Usually `toCssRect(a.rect)`. Stroked
 * paths (lines, polylines, polygons, ink) use the bounds of their own points instead of
 * `rect` (which may already carry stroke padding, as a derived ink rect does), padded once by
 * half their stroke width on every side, at least 1px in all, so a horizontal or vertical
 * line still has a box to draw and hit-test in, and grown to the drawing's bounds, which hold a
 * line's endings. A shape with a hit twin (see `hasHitTwin`)
 * is padded by at least 4px more, so its wider hit area is not clipped. Custom elements do
 * not use this: they sit on `toCssRect(a.rect)`.
 */
export function annotationBox(a: Annotation, t: PageTransform): CssRect {
  const drawn = handleBox(a, t)
  if (!hasHitTwin(a)) return drawn
  const pad = hitPad(a, t)
  return {
    left: drawn.left - pad,
    top: drawn.top - pad,
    width: drawn.width + pad * 2,
    height: drawn.height + pad * 2,
  }
}

/**
 * How far past `handleBox` a shape with a hit twin extends its element: the twin's overhang
 * beyond the drawn stroke, and at least 4px.
 */
function hitPad(a: Annotation, t: PageTransform): number {
  const overhang = Math.max(0, hitWidth(a, t) - t.toCssLength('width' in a ? a.width : 0))
  return Math.max(HIT_STROKE / 2, overhang / 2)
}

/**
 * The CSS box an annotation's edit handles and resizing work on: `annotationBox` without the
 * padding its hit twin needs. `toCssRect(a.rect)` for a rect-shaped annotation; the padded
 * bounds of its points for a stroked path.
 */
export function handleBox(a: Annotation, t: PageTransform): CssRect {
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
  // Half the stroke on every side, at least 1px in all, and whatever else is drawn beyond it: a
  // line's endings, which are sized in points and so reach further the more the page is zoomed.
  const pad = stroke / 2
  const padded = {
    left: box.left - pad,
    top: box.top - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  }
  const bounds = a.type === 'ink' ? undefined : drawingFor(a, t)?.bounds
  if (!bounds) return padded
  const drawn = t.toCssRect(bounds)
  const left = Math.min(padded.left, drawn.left)
  const top = Math.min(padded.top, drawn.top)
  return {
    left,
    top,
    width: Math.max(padded.left + padded.width, drawn.left + drawn.width) - left,
    height: Math.max(padded.top + padded.height, drawn.top + drawn.height) - top,
  }
}

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
 * A free text's text box (`freeTextBox`) in CSS px, relative to the top-left of its rect on
 * screen, where its overlay element sits.
 */
export function freeTextLocalBox(a: FreeTextAnnotation, t: PageTransform): CssRect {
  const origin = t.toCssRect(a.rect)
  const box = t.toCssRect(freeTextBox(a))
  return {
    left: box.left - origin.left,
    top: box.top - origin.top,
    width: box.width,
    height: box.height,
  }
}

/**
 * Draws the default visual for an annotation inside its positioned element. Coordinates are
 * relative to the element. Colour, opacity and stroke of a drawn shape are SVG attributes and
 * the same inline style, so a host's rule on `svg path` or `rect` cannot recolour them. A type with no drawing leaves the element empty. The
 * overlay gives an annotation the page canvas paints a hit area instead (`renderHitArea`).
 */
export function renderAnnotationContent(
  el: HTMLElement,
  a: Annotation,
  t: PageTransform
): void {
  const d = drawingFor(a, t)
  if (d?.layer === 'page') {
    // Painted by the page's own layer (a mask's dimming): the element holds only chrome.
    const box = annotationBox(a, t)
    const svg = boxSvg(el.ownerDocument, box.width, box.height)
    svg.classList.add('ink-annotation-shape')
    el.replaceChildren(svg)
    renderChrome(el, a, t)
  } else if (d) {
    paintDrawing(el, d, t, annotationBox(a, t))
    renderChrome(el, a, t)
  } else el.replaceChildren()
}

/** The geometry attributes a hit twin keeps from the element a drawn shape becomes. */
const TWIN_GEOMETRY = new Set([
  'x',
  'y',
  'width',
  'height',
  'rx',
  'cx',
  'cy',
  'ry',
  'points',
  'd',
])

/**
 * The hit twin, edge band and comment marker of a painted annotation: what a press needs and
 * a drawing does not hold. A stroke-only shape gets a wider invisible copy of its geometry,
 * built from the drawing's own items: a square or circle one, a line or polyline one for its
 * shaft and one for each ending, a polygon without a fill one; commented text markup gets its
 * marker.
 */
function renderChrome(el: HTMLElement, a: Annotation, t: PageTransform): void {
  const svg = el.querySelector(':scope > svg')
  const group = svg ? drawingFor(a, t)?.items[0] : undefined
  const drawn = group?.kind === 'group' ? group.items : []
  if (svg && hasHitTwin(a)) {
    const box = annotationBox(a, t)
    // An ink stroke is drawn as an outline, but a press should land near its path: the twin
    // follows the sampled points.
    const followed: readonly DrawItem[] =
      a.type === 'ink'
        ? a.inklist.flatMap((points): DrawItem[] =>
            // A stroke of one point is a dot: two equal points give a round cap something to
            // draw, and one with no points has nothing to press on.
            points.length === 0
              ? []
              : [
                  {
                    kind: 'polyline',
                    points: points.length === 1 ? [points[0]!, points[0]!] : points,
                    paint: {},
                  },
                ]
          )
        : drawn
    for (const item of followed) {
      if (item.kind === 'text' || item.kind === 'image' || item.kind === 'page') continue
      const twin = itemElement(el.ownerDocument, item, t, box)
      for (const attr of [...twin.attributes]) {
        if (!TWIN_GEOMETRY.has(attr.name)) twin.removeAttribute(attr.name)
      }
      if (a.type === 'line' || a.type === 'polyline' || a.type === 'polygon') {
        twin.setAttribute('stroke-linejoin', 'round')
        if (item.role) twin.setAttribute('stroke-linecap', 'round')
      } else if (a.type === 'ink') {
        twin.setAttribute('stroke-linejoin', 'round')
        twin.setAttribute('stroke-linecap', 'round')
      }
      twin.setAttribute('data-ink-hit-stroke', '')
      invisible(twin, 'none', 'transparent', hitWidth(a, t))
      twin.setAttribute('pointer-events', 'stroke')
      svg.append(twin)
    }
  }
  if (svg) appendStampHit(svg, a, t, annotationBox(a, t))
  if (svg && a.type === 'loupe') appendLensHit(svg, a, t)
  if (svg && a.type === 'mask') appendMaskEdge(svg, a, t)
  if (svg && a.type === 'text') appendNoteHit(svg, a, t)
  if (a.type === 'freetext') appendTextChrome(el, a, t)
  appendCommentMarker(el, a, t)
}

/** Width in CSS px of the band straddling a text box's edge, which drags the box. */
const TEXT_EDGE = 6

/**
 * What a press on a text box needs and its drawing does not hold, in one svg over the text: a
 * transparent rect over the text box that takes presses (`[data-ink-text-area]`: a press inside
 * edits the text), a band along its edge that selects and drags it instead, and, outside the svg,
 * the frame a fringed box is outlined by when selected. They are svg shapes with inline paint, so
 * a host rule on an HTML class cannot put a background or border over the drawn text.
 */
function appendTextChrome(
  el: HTMLElement,
  a: FreeTextAnnotation,
  t: PageTransform
): void {
  const doc = el.ownerDocument
  const inner = freeTextLocalBox(a, t)
  const box = annotationBox(a, t)
  // A later sibling of the drawing, so it takes presses above it once the theme positions it.
  const svg = boxSvg(doc, box.width, box.height)
  const area = doc.createElementNS(SVG, 'rect')
  area.setAttribute('x', String(inner.left))
  area.setAttribute('y', String(inner.top))
  area.setAttribute('width', String(inner.width))
  area.setAttribute('height', String(inner.height))
  invisible(area, 'transparent', 'none')
  area.setAttribute('pointer-events', 'all')
  area.setAttribute('data-ink-text-area', '')
  const band = doc.createElementNS(SVG, 'rect')
  band.setAttribute('x', String(inner.left))
  band.setAttribute('y', String(inner.top))
  band.setAttribute('width', String(inner.width))
  band.setAttribute('height', String(inner.height))
  invisible(band, 'none', 'transparent', TEXT_EDGE)
  band.setAttribute('pointer-events', 'stroke')
  band.setAttribute('data-ink-edge', '')
  svg.append(area, band)
  el.append(svg)
  appendSelectionFrame(el, a, t)
}

/**
 * A note's press area: an invisible rect over its whole square, so a press on the glyph or on
 * any part of the square that is not painted still selects the note. Names the icon on the
 * square, for whoever styles or inspects it.
 */
function appendNoteHit(svg: Element, a: NoteAnnotation, t: PageTransform): void {
  const box = annotationBox(a, t)
  svg.querySelector(':scope > .ink-note-icon')?.setAttribute('data-icon', a.icon)
  // The theme puts the note's shadow on the svg, which follows what is drawn in it.
  svg.setAttribute('data-ink-note', '')
  const hit = svg.ownerDocument.createElementNS(SVG, 'rect')
  hit.setAttribute('x', '0')
  hit.setAttribute('y', '0')
  hit.setAttribute('width', String(box.width))
  hit.setAttribute('height', String(box.height))
  invisible(hit, 'transparent', 'none')
  hit.setAttribute('pointer-events', 'all')
  hit.setAttribute('data-ink-hit-area', '')
  hit.classList.add('ink-note-box')
  svg.append(hit)
}

/** Width in CSS px of the band along a mask's edge that takes presses. */
const MASK_EDGE = 6

/**
 * A loupe's press area: an invisible circle over the whole lens, so a press anywhere on it
 * selects the loupe whether or not it has a rim. Its size is the drawing's clip circle.
 */
function appendLensHit(svg: Element, a: Annotation, t: PageTransform): void {
  const lens = drawingFor(a, t)?.items.find((i) => i.kind === 'page')
  if (lens?.kind !== 'page') return
  const box = annotationBox(a, t)
  const c = t.toCss(lens.clip.center)
  const hit = svg.ownerDocument.createElementNS(SVG, 'circle')
  hit.setAttribute('cx', String(c.x - box.left))
  hit.setAttribute('cy', String(c.y - box.top))
  hit.setAttribute('r', String(t.toCssLength(lens.clip.radius)))
  invisible(hit, 'transparent', 'none')
  hit.setAttribute('pointer-events', 'all')
  hit.setAttribute('data-ink-hit-area', '')
  svg.append(hit)
}

/**
 * A mask's press area: the shape's outline as an invisible band just inside the edge, so only
 * the edge takes presses. The spotlight stays readable, selectable and annotatable, and the
 * dimmed area outside belongs to the page.
 */
function appendMaskEdge(svg: Element, a: Annotation, t: PageTransform): void {
  if (a.type !== 'mask') return
  const box = annotationBox(a, t)
  const inset = MASK_EDGE / 2
  const doc = svg.ownerDocument
  const shape = doc.createElementNS(SVG, a.shape === 'ellipse' ? 'ellipse' : 'rect')
  const attrs =
    a.shape === 'ellipse'
      ? {
          cx: box.width / 2,
          cy: box.height / 2,
          rx: Math.max(0, box.width / 2 - inset),
          ry: Math.max(0, box.height / 2 - inset),
        }
      : {
          x: inset,
          y: inset,
          width: Math.max(0, box.width - MASK_EDGE),
          height: Math.max(0, box.height - MASK_EDGE),
        }
  for (const [k, v] of Object.entries(attrs)) shape.setAttribute(k, String(v))
  invisible(shape, 'none', 'transparent', MASK_EDGE)
  shape.setAttribute('pointer-events', 'visiblePainted')
  shape.classList.add('ink-mask-shape')
  svg.append(shape)
}

/**
 * A stamp's press area: an invisible rect over the stamp's box, so a press on a transparent
 * pixel of the picture selects it whatever the browser does with pixels, and no native image
 * drag can start. The images drawn stop taking presses. The box is the annotation's, whatever
 * the drawing is made of.
 */
function appendStampHit(
  svg: Element,
  a: Annotation,
  t: PageTransform,
  box: CssRect
): void {
  if (a.type !== 'stamp') return
  for (const image of svg.querySelectorAll('image'))
    image.setAttribute('pointer-events', 'none')
  const r = t.toCssRect(a.rect)
  const hit = svg.ownerDocument.createElementNS(SVG, 'rect')
  hit.setAttribute('x', String(r.left - box.left))
  hit.setAttribute('y', String(r.top - box.top))
  hit.setAttribute('width', String(r.width))
  hit.setAttribute('height', String(r.height))
  invisible(hit, 'transparent', 'none')
  hit.setAttribute('pointer-events', 'all')
  hit.setAttribute('data-ink-hit-area', '')
  svg.append(hit)
}

/**
 * An invisible hit area for an annotation the overlay does not draw (embedded ones, which
 * PDF.js paints on the canvas): polygons over its quads, or its rect. Selection chrome only.
 */
export function renderHitArea(el: HTMLElement, a: Annotation, t: PageTransform): void {
  drawHitArea(el, a, t)
  if (a.type === 'freetext') appendSelectionFrame(el, a, t)
  appendCommentMarker(el, a, t)
}

/**
 * For a free text inset by a fringe: a `div.ink-selection-frame` over its text box, where its
 * corner handles sit, and `data-framed` on the element, so the theme draws the selection
 * outline on the box rather than round the whole rect. Geometry only, `pointer-events:none`.
 */
function appendSelectionFrame(
  el: HTMLElement,
  a: FreeTextAnnotation,
  t: PageTransform
): void {
  el.toggleAttribute('data-framed', a.fringe !== undefined)
  if (!a.fringe) return
  const box = freeTextLocalBox(a, t)
  const frame = el.ownerDocument.createElement('div')
  frame.className = 'ink-selection-frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText =
    `position:absolute;pointer-events:none;left:${box.left}px;top:${box.top}px;` +
    `width:${box.width}px;height:${box.height}px;`
  el.append(frame)
}

/** True for text markup whose `contents` holds a comment. */
export function hasComment(a: Annotation): a is TextMarkupAnnotation {
  return isTextMarkup(a) && !!a.contents?.trim()
}

/**
 * Marks commented text markup with `span.ink-comment-marker`, holding a comment glyph, at the
 * last quad's top-right corner (its end in reading order), relative to the element. The theme
 * sizes and colours it.
 */
function appendCommentMarker(el: HTMLElement, a: Annotation, t: PageTransform): void {
  if (!hasComment(a)) return
  const last = a.quads[a.quads.length - 1]
  if (!last) return
  const box = annotationBox(a, t)
  const at = t.toCss(last.p2)
  const marker = el.ownerDocument.createElement('span')
  marker.className = 'ink-comment-marker'
  marker.dataset.inkCommentMarker = ''
  marker.setAttribute('aria-hidden', 'true')
  marker.style.left = `${at.x - box.left}px`
  marker.style.top = `${at.y - box.top}px`
  const icon = el.ownerDocument.createElementNS(SVG, 'svg')
  for (const [k, v] of Object.entries(ICON_ATTRIBUTES)) icon.setAttribute(k, v)
  for (const [tag, attrs] of MessageSquareText) {
    const child = el.ownerDocument.createElementNS(SVG, tag)
    for (const [k, v] of Object.entries(attrs)) child.setAttribute(k, v)
    icon.append(child)
  }
  marker.append(icon)
  el.append(marker)
}

function drawHitArea(el: HTMLElement, a: Annotation, t: PageTransform): void {
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
    invisible(shape, 'transparent', 'none')
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
