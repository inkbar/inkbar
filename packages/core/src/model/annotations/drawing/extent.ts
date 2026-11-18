import { unionRects } from '../../geometry'

import { arcToCubics } from './arc'
import { standardMeasure } from './text/measure'

import type { DrawItem, Paint, PathCommand } from './types'
import type { Point, Rect } from '../../geometry'

/** `r` grown by `by` on every side. */
export function padRect(r: Rect, by: number): Rect {
  return {
    x: r.x - by,
    y: r.y - by,
    width: r.width + by * 2,
    height: r.height + by * 2,
  }
}

/** The box around `points`, or `undefined` for none. */
export function pointsRect(points: readonly Point[]): Rect | undefined {
  if (points.length === 0) return undefined
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of points) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** The parameters in (0, 1) where one coordinate of a cubic stops growing or shrinking. */
function turns(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3
  const b = 2 * (p0 - 2 * p1 + p2)
  const c = p1 - p0
  const roots: number[] = []
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b)
  } else {
    const disc = b * b - 4 * a * c
    if (disc >= 0) {
      const root = Math.sqrt(disc)
      roots.push((-b + root) / (2 * a), (-b - root) / (2 * a))
    }
  }
  return roots.filter((t) => t > 0 && t < 1)
}

const cubicAt = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const s = 1 - t
  return s * s * s * p0 + 3 * s * s * t * p1 + 3 * s * t * t * p2 + t * t * t * p3
}

/**
 * The box around the path `commands` trace, exactly: curves and arcs included, their control
 * points not. `undefined` for a path that places nothing.
 */
export function commandsRect(commands: readonly PathCommand[]): Rect | undefined {
  const points: Point[] = []
  let at: Point | undefined
  let start: Point | undefined
  const cubic = (from: Point, c1: Point, c2: Point, to: Point): void => {
    points.push(to)
    for (const t of turns(from.x, c1.x, c2.x, to.x))
      points.push({
        x: cubicAt(from.x, c1.x, c2.x, to.x, t),
        y: cubicAt(from.y, c1.y, c2.y, to.y, t),
      })
    for (const t of turns(from.y, c1.y, c2.y, to.y))
      points.push({
        x: cubicAt(from.x, c1.x, c2.x, to.x, t),
        y: cubicAt(from.y, c1.y, c2.y, to.y, t),
      })
  }
  for (const c of commands) {
    switch (c.op) {
      case 'M':
        points.push(c.to)
        at = start = c.to
        break
      case 'L':
        points.push(c.to)
        at = c.to
        break
      case 'C':
        if (at) cubic(at, c.c1, c.c2, c.to)
        else points.push(c.to)
        at = c.to
        break
      case 'A':
        if (at) {
          let from = at
          for (const piece of arcToCubics(at, c)) {
            cubic(from, piece.c1, piece.c2, piece.to)
            from = piece.to
          }
        }
        points.push(c.to)
        at = c.to
        break
      case 'Z':
        at = start
        break
    }
  }
  return pointsRect(points)
}

/**
 * `rect` inset by half of `width`, so a stroke of that width centred on it stays inside `rect`.
 * A `rect` narrower than the stroke collapses to its centre line, and the stroke then reaches
 * past `rect` evenly on both sides. `reach` is the box the stroke covers: `rect` itself unless
 * the stroke is wider than it is.
 */
export function strokeInset(rect: Rect, width: number): { inset: Rect; reach: Rect } {
  const half = Math.max(0, width) / 2
  const dx = Math.min(half, rect.width / 2)
  const dy = Math.min(half, rect.height / 2)
  const growX = Math.max(0, half - rect.width / 2)
  const growY = Math.max(0, half - rect.height / 2)
  return {
    inset: {
      x: rect.x + dx,
      y: rect.y + dy,
      width: rect.width - dx * 2,
      height: rect.height - dy * 2,
    },
    reach: {
      x: rect.x - growX,
      y: rect.y - growY,
      width: rect.width + growX * 2,
      height: rect.height + growY * 2,
    },
  }
}

type TextItem = Extract<DrawItem, { kind: 'text' }>

/** Cosine and sine of each of a text's turns, anticlockwise in user space. */
const TURNS: Record<TextItem['angle'], readonly [number, number]> = {
  0: [1, 0],
  90: [0, 1],
  180: [-1, 0],
  270: [0, -1],
}

/**
 * The box a text with no clip paints in: each line (each segment, on a line with tabs) from its
 * origin along its width with its word spacing, and from the family's descent below the baseline
 * to its ascent above, turned with the text about the origin. `undefined` for no lines.
 */
function textRect(item: TextItem): Rect | undefined {
  const { ascent, descent } = standardMeasure.vertical(item.font)
  const [c, s] = TURNS[item.angle]
  const points: Point[] = []
  for (const line of item.lines) {
    const spacing = line.wordSpacing ?? 0
    for (const run of line.segments ?? [line]) {
      const gaps = [...run.text].filter((ch) => ch === ' ').length
      const length = run.width + gaps * spacing
      for (const u of [0, length])
        for (const v of [-descent * item.size, ascent * item.size])
          points.push({
            x: run.origin.x + u * c - v * s,
            y: run.origin.y + u * s + v * c,
          })
    }
  }
  return pointsRect(points)
}

/**
 * The box `item` paints in, in user space: its geometry widened by half its stroke, which is
 * all a stroke can add because joins and caps are never longer than that: a join is round
 * wherever a corner is sharp, and a miter at a right angle ends on the corner of the widened
 * box. A `page` item paints its target, and a text its clip, or its lines' boxes without one.
 */
export function paintedRect(item: DrawItem): Rect | undefined {
  const pad = (r: Rect | undefined, paint: Paint): Rect | undefined =>
    r && paint.stroke ? padRect(r, paint.stroke.width / 2) : r
  switch (item.kind) {
    case 'polygon':
    case 'polyline':
      return pad(pointsRect(item.points), item.paint)
    case 'rect':
    case 'ellipse':
      return pad(item.rect, item.paint)
    case 'path':
      return pad(commandsRect(item.commands), item.paint)
    case 'image':
      return item.rect
    case 'text':
      return item.clip?.rect ?? textRect(item)
    case 'page':
      return item.target
    case 'group': {
      const rects = item.items.flatMap((i) => paintedRect(i) ?? [])
      return rects.length > 0 ? unionRects(rects) : undefined
    }
  }
}
