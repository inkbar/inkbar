// Geometry edits in user space, shared by the pointer (select tool) and keyboard (overlay)
// paths so both produce the same patch for the same change.
import { translateQuad, translateRect, type Point, type Rect } from '../geometry'

import type { Annotation, LineAnnotation, TextMarkupAnnotation } from './types'

/** Smallest width or height a resize leaves, user-space points. */
export const MIN_SIZE = 1

const shift = (p: Point, dx: number, dy: number): Point => ({ x: p.x + dx, y: p.y + dy })

/** The geometry patch that translates `a` by (dx, dy) in user space. */
export function translated(a: Annotation, dx: number, dy: number): Partial<Annotation> {
  const patch: Record<string, unknown> = { rect: translateRect(a.rect, dx, dy) }
  if ('quads' in a && a.quads) patch.quads = a.quads.map((q) => translateQuad(q, dx, dy))
  if ('callout' in a && a.callout) patch.callout = a.callout.map((p) => shift(p, dx, dy))
  switch (a.type) {
    case 'line':
      patch.start = shift(a.start, dx, dy)
      patch.end = shift(a.end, dx, dy)
      break
    case 'polyline':
    case 'polygon':
      patch.vertices = a.vertices.map((p) => shift(p, dx, dy))
      break
    case 'ink':
      patch.inklist = a.inklist.map((path) => path.map((p) => shift(p, dx, dy)))
      break
    default:
  }
  return patch
}

/**
 * True when `rect` is the annotation's whole shape, so resizing means changing `rect`: area
 * redactions, free text, squares and circles. Text-derived marks (quads), note icons and
 * point-based shapes are not.
 */
export function hasRectGeometry(a: Annotation): boolean {
  switch (a.type) {
    case 'redact':
      return a.quads === undefined || a.quads.length === 0
    case 'freetext':
    case 'square':
    case 'circle':
      return true
    default:
      return false
  }
}

/**
 * Grows (positive) or shrinks (negative) a rect by `dw` and `dh` points, keeping its top-left
 * corner (user space: left edge and top edge, `y + height`) where it is. Neither side goes
 * below `MIN_SIZE`.
 */
export function resizedRect(r: Rect, dw: number, dh: number): Rect {
  const width = Math.max(MIN_SIZE, r.width + dw)
  const height = Math.max(MIN_SIZE, r.height + dh)
  const top = r.y + r.height
  return { x: r.x, y: top - height, width, height }
}

/**
 * True for highlight, underline, strikeout and squiggly: marks on text, which a drag passes
 * through to text selection and a click selects.
 */
export function isTextMarkup(a: Pick<Annotation, 'type'>): a is TextMarkupAnnotation {
  return (
    a.type === 'highlight' ||
    a.type === 'underline' ||
    a.type === 'strikeout' ||
    a.type === 'squiggly'
  )
}

/**
 * True for the point-based shapes a corner handle resizes by scaling their points: polylines,
 * polygons and ink. With `hasRectGeometry`, the annotations that get corner handles.
 */
export function scalesPoints(a: Annotation): boolean {
  return a.type === 'polyline' || a.type === 'polygon' || a.type === 'ink'
}

/** True when a corner handle resizes `a`: rect-shaped types and point-based shapes. */
export function hasCornerHandles(a: Annotation): boolean {
  return hasRectGeometry(a) || scalesPoints(a)
}

/**
 * The geometry patch that maps `a` from the box `from` onto the box `to`, both in user space:
 * `rect` and every point field (quads, ink paths, vertices, line ends, callout) scale with the
 * boxes. Stroke widths and font sizes stay as they are.
 */
export function scaled(a: Annotation, from: Rect, to: Rect): Partial<Annotation> {
  const sx = from.width === 0 ? 1 : to.width / from.width
  const sy = from.height === 0 ? 1 : to.height / from.height
  const map = (p: Point): Point => ({
    x: to.x + (p.x - from.x) * sx,
    y: to.y + (p.y - from.y) * sy,
  })
  const sameBox = (r: Rect): boolean =>
    r.x === from.x && r.y === from.y && r.width === from.width && r.height === from.height
  const patch: Record<string, unknown> = {
    // The common case, a rect that is the box, maps exactly rather than through the scale.
    rect: sameBox(a.rect)
      ? { ...to }
      : {
          ...map(a.rect),
          width: a.rect.width * sx,
          height: a.rect.height * sy,
        },
  }
  if ('quads' in a && a.quads)
    patch.quads = a.quads.map((q) => ({
      p1: map(q.p1),
      p2: map(q.p2),
      p3: map(q.p3),
      p4: map(q.p4),
    }))
  if ('callout' in a && a.callout) patch.callout = a.callout.map(map)
  switch (a.type) {
    case 'line':
      patch.start = map(a.start)
      patch.end = map(a.end)
      break
    case 'polyline':
    case 'polygon':
      patch.vertices = a.vertices.map(map)
      break
    case 'ink':
      patch.inklist = a.inklist.map((path) => path.map(map))
      break
    default:
  }
  return patch
}

/**
 * The patch that moves one end of a line to `to` and refits `rect` to the new ends, padded by
 * half the stroke width on every side.
 */
export function movedEndpoint(
  a: LineAnnotation,
  which: 'start' | 'end',
  to: Point
): Partial<LineAnnotation> {
  const start = which === 'start' ? to : a.start
  const end = which === 'end' ? to : a.end
  const pad = a.width / 2
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  return {
    [which]: { ...to },
    rect: {
      x: x - pad,
      y: y - pad,
      width: Math.abs(end.x - start.x) + pad * 2,
      height: Math.abs(end.y - start.y) + pad * 2,
    },
  }
}

/**
 * True for annotations whose resize keeps their aspect ratio without `Shift`: stamps, loupes,
 * masks and signatures (ink with subject `Signature`).
 */
export function keepsAspect(a: Annotation): boolean {
  // Some of these types arrive later; compare the type as a plain string.
  switch (a.type as string) {
    case 'stamp':
    case 'loupe':
    case 'mask':
      return true
    case 'ink':
      return (a as { subject?: string }).subject === 'Signature'
    default:
      return false
  }
}
