import { rectFromQuad } from '../../geometry'

import type { Point, Quad, Rect } from '../../geometry'
import type { RedactAnnotation, TextMarkupAnnotation } from '../types'
import type { DrawItem, Drawing } from './types'

const lerp = (a: Point, b: Point, f: number): Point => ({
  x: a.x + (b.x - a.x) * f,
  y: a.y + (b.y - a.y) * f,
})
const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)

/** Quad corners in drawing order: p1 top-left, p2 top-right, p4 bottom-right, p3 bottom-left. */
const corners = (q: Quad): Point[] => [q.p1, q.p2, q.p4, q.p3]

/** The box that contains every quad. */
function quadsBounds(quads: readonly Quad[], fallback: Rect): Rect {
  if (quads.length === 0) return fallback
  const rects = quads.map(rectFromQuad)
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  }
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

/**
 * A highlight, underline, strikeout or squiggly. A highlight is one polygon per quad, each
 * with its own fill opacity so overlaps compound; the others are one polyline per quad in a
 * group that carries the opacity.
 */
export function describeMarkup(a: TextMarkupAnnotation): Drawing {
  const bounds = quadsBounds(a.quads, a.rect)
  if (a.type === 'highlight') {
    return {
      layer: 'annotation',
      bounds,
      items: a.quads.map((q): DrawItem => ({
        kind: 'polygon',
        points: corners(q),
        paint: { fill: { color: a.color, opacity: a.opacity } },
      })),
    }
  }
  const type = a.type
  return {
    layer: 'annotation',
    bounds,
    items: [
      {
        kind: 'group',
        opacity: a.opacity,
        items: a.quads.map((q): DrawItem => ({
          kind: 'polyline',
          points: markupLine(type, q),
          paint: { stroke: { color: a.color, width: markupStroke(q) } },
        })),
      },
    ],
  }
}

/** A redaction mark: a polygon per quad, or the rect, tinted at 15% with a one point outline. */
export function describeRedact(a: RedactAnnotation): Drawing {
  const paint = {
    fill: { color: a.interiorColor, opacity: 0.15 },
    stroke: { color: a.color, width: 1 },
  }
  const items: DrawItem[] = a.quads
    ? a.quads.map((q): DrawItem => ({ kind: 'polygon', points: corners(q), paint }))
    : [{ kind: 'rect', rect: a.rect, paint }]
  return {
    layer: 'annotation',
    bounds: a.quads ? quadsBounds(a.quads, a.rect) : a.rect,
    items: [{ kind: 'group', opacity: a.opacity, items }],
  }
}
