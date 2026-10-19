// Geometry edits in user space, shared by the pointer (select tool) and keyboard (overlay)
// paths so both produce the same patch for the same change.
import { translateQuad, translateRect, type Point, type Rect } from '../geometry'

import type { Annotation } from './types'

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
