// Geometry edits in user space, shared by the pointer (select tool) and keyboard (overlay)
// paths so both produce the same patch for the same change.
import { translateQuad, translateRect, type Point, type Rect } from '../geometry'

import {
  calloutStroke,
  freeTextBox,
  isStandardCallout,
  withCalloutBounds,
} from './callout'

import type {
  Annotation,
  FreeTextAnnotation,
  LineAnnotation,
  TextMarkupAnnotation,
} from './types'

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
 * redactions, free text, squares, circles, stamps, loupes and masks. Text-derived marks (quads), note icons and
 * point-based shapes are not.
 */
export function hasRectGeometry(a: Annotation): boolean {
  switch (a.type) {
    case 'redact':
      return a.quads === undefined || a.quads.length === 0
    case 'freetext':
    case 'square':
    case 'circle':
    case 'stamp':
    case 'loupe':
    case 'mask':
      return true
    default:
      return false
  }
}

/**
 * Grows (positive) or shrinks (negative) a rect by `dw` and `dh` points, keeping its top-left
 * corner (user space: left edge and top edge, `y + height`) where it is. Neither side goes
 * below `MIN_SIZE`. With `keepAspect`, the side that changes leads and the other follows it in
 * proportion (the width when both change).
 */
export function resizedRect(r: Rect, dw: number, dh: number, keepAspect = false): Rect {
  let width = Math.max(MIN_SIZE, r.width + dw)
  let height = Math.max(MIN_SIZE, r.height + dh)
  if (keepAspect && r.width > 0 && r.height > 0) {
    const aspect = r.width / r.height
    if (dw !== 0) height = width / aspect
    else width = height * aspect
    // Neither side below MIN_SIZE, still in proportion.
    const grow = Math.max(MIN_SIZE / width, MIN_SIZE / height, 1)
    width *= grow
    height *= grow
  }
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
 * `rect`, every point field (quads, ink paths, vertices, line ends, callout) and a free text's
 * `fringe` scale with the boxes. Stroke widths and font sizes stay as they are.
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
  // The text box inside a free text's rect scales with it.
  if (a.type === 'freetext' && a.fringe)
    patch.fringe = {
      left: a.fringe.left * sx,
      top: a.fringe.top * sy,
      right: a.fringe.right * sx,
      bottom: a.fringe.bottom * sy,
    }
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
  if (a.type === 'stamp' || a.type === 'loupe' || a.type === 'mask') return true
  return a.type === 'ink' && a.subject === 'Signature'
}

/**
 * True for a speech bubble: a standard free-text callout (`intent: 'FreeTextCallout'`, `rect`,
 * `fringe`, `callout`) with Inkbar's `cornerRadius`. Inkbar draws it as one rounded outline with
 * a wedge from where `callout`'s last point meets the box to the tip, `callout[0]`.
 */
export function isBubble(
  a: Annotation
): a is FreeTextAnnotation & { callout: [Point, Point, ...Point[]] } {
  return (
    a.type === 'freetext' &&
    a.intent === 'FreeTextCallout' &&
    a.cornerRadius !== undefined &&
    a.callout !== undefined &&
    a.callout.length >= 2
  )
}

/** True for a free text with a callout to edit: a speech bubble or a standard callout. */
export function hasCallout(
  a: Annotation
): a is FreeTextAnnotation & { callout: [Point, Point, ...Point[]] } {
  return isBubble(a) || isStandardCallout(a)
}

/**
 * The patch that puts a free text's text box at `box`, refitting `rect` and `fringe` around
 * it. A callout's points become `callout` (its own by default) and `rect` holds them too; any
 * other box keeps its fringe, or has `rect` equal to the box without one.
 */
export function withBox(
  a: FreeTextAnnotation,
  box: Rect,
  callout: readonly Point[] | undefined = a.callout
): Partial<FreeTextAnnotation> {
  if (hasCallout(a) && callout)
    return {
      ...withCalloutBounds(box, callout, calloutStroke(a).width, a.head),
      callout: callout.map((p) => ({ ...p })),
    }
  const f = a.fringe
  if (!f) return { rect: { ...box } }
  return {
    rect: {
      x: box.x - f.left,
      y: box.y - f.bottom,
      width: box.width + f.left + f.right,
      height: box.height + f.bottom + f.top,
    },
  }
}

/**
 * `p` carried from the box `from` onto the box `to`: it keeps its fraction along the box edge
 * nearest it and its distance off that edge.
 */
export function onMovedEdge(p: Point, from: Rect, to: Rect): Point {
  const gaps = {
    left: Math.abs(p.x - from.x),
    right: Math.abs(p.x - (from.x + from.width)),
    bottom: Math.abs(p.y - from.y),
    top: Math.abs(p.y - (from.y + from.height)),
  }
  const edge = (Object.keys(gaps) as (keyof typeof gaps)[]).reduce((best, e) =>
    gaps[e] < gaps[best] ? e : best
  )
  const along = (
    v: number,
    start: number,
    size: number,
    next: number,
    nextSize: number
  ) => next + (size === 0 ? nextSize / 2 : ((v - start) / size) * nextSize)
  if (edge === 'left' || edge === 'right') {
    const x = edge === 'left' ? from.x : from.x + from.width
    const nx = edge === 'left' ? to.x : to.x + to.width
    return { x: nx + p.x - x, y: along(p.y, from.y, from.height, to.y, to.height) }
  }
  const y = edge === 'bottom' ? from.y : from.y + from.height
  const ny = edge === 'bottom' ? to.y : to.y + to.height
  return { x: along(p.x, from.x, from.width, to.x, to.width), y: ny + p.y - y }
}

/**
 * The patch that resizes a free text's text box to `to`. A callout's tip and bend stay where
 * they are and its last point moves with the box edge it sits on (`onMovedEdge`).
 */
export function resizedBox(a: FreeTextAnnotation, to: Rect): Partial<FreeTextAnnotation> {
  if (!hasCallout(a)) return withBox(a, to)
  const from = freeTextBox(a)
  const last = a.callout.length - 1
  return withBox(
    a,
    to,
    a.callout.map((p, i) => (i === last ? onMovedEdge(p, from, to) : p))
  )
}

/** The patch that moves a callout's tip to `to`, leaving its text box where it is. */
export function movedTip(
  a: FreeTextAnnotation & { callout: readonly Point[] },
  to: Point
): Partial<FreeTextAnnotation> {
  return withBox(a, freeTextBox(a), [to, ...a.callout.slice(1)])
}
