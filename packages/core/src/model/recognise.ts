// Recognises a single freehand stroke as a standard shape, by geometric fitting. Pure: no DOM.
//
// The stroke is resampled to evenly spaced points (a fiftieth of its box's diagonal apart, so
// every test is scale-free). Corners of a closed stroke are where the path turns sharply over a
// few samples, and corners whose neighbours run straight through them are dropped. Then each
// kind is fitted and scored from 0 to 1, and the best fit wins:
//
// - line: how far the path strays from the chord between its ends;
// - arrow: a straight shaft, then a short head at one end that folds back towards it;
// - closed strokes (the ends meet, an overshoot trimmed) that wind once round their centre:
//   - ellipse: how far points stray from the ellipse inscribed in the stroke's box;
//   - rectangle: four corners, sides alternating horizontal and vertical;
//   - polygon: three to eight corners joined by straight sides that do not cross;
//   - star: an outline whose corners alternate far from and near the centre, or a pentagram
//     (five straight strokes that wind twice).
//
// A stroke that fails every gate (open and bent, winding more or less than once, sides that
// cross, a corner count no kind has) gets no candidate, so a scrawl or a scribble comes back
// undefined or scored low.
import { starVertices } from './annotations/shape-geometry'

import type { Point, Rect } from './geometry'

export type Recognised =
  | { kind: 'line'; start: Point; end: Point }
  | { kind: 'arrow'; start: Point; end: Point }
  | { kind: 'rectangle'; rect: Rect }
  | { kind: 'ellipse'; rect: Rect }
  /** A triangle or other closed polygon, its vertices where the stroke's corners are. */
  | { kind: 'polygon'; vertices: Point[] }
  /** A regular star, outer and inner vertices alternating, the first tip at the top. */
  | { kind: 'star'; vertices: Point[] }

/** The score a fit needs before a stroke is tidied into its shape. */
export const RECOGNISE_THRESHOLD = 0.8

/** Samples either side of a point that its turn is measured over. */
const W = 3
/** Turns, over `2 * W` samples, that make a corner: outward, and back against the loop. */
const CONVEX_TURN = (40 * Math.PI) / 180
const CONCAVE_TURN = (15 * Math.PI) / 180
/** Resampled points along the box diagonal. */
const DENSITY = 50
/** A run of path is straight when its chord is at least this share of its length. */
const STRAIGHT = 0.95
/** Corners whose neighbours this straight run through them (a turn under about 23 degrees) go. */
const MERGE_STRAIGHT = 0.98
/** The ends of a closed stroke are within this share of the box diagonal. */
const CLOSE_GAP = 0.25
/** Weights of a line's largest and mean straying from its chord, over its length. */
const LINE_MAX = 2
const LINE_MEAN = 2
/** Weight of a polygon side's mean straying from its chord, over its length. */
const SIDE_MEAN = 3

interface Fit {
  shape: Recognised
  score: number
}

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)
const clamp01 = (n: number): number => Math.min(Math.max(n, 0), 1)
const round = (n: number): number => Math.round(n * 100) / 100 + 0
const pt = (p: Point): Point => ({ x: round(p.x), y: round(p.y) })

function boxOf(points: readonly Point[]): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

const diagonal = (r: Rect): number => Math.hypot(r.width, r.height)

function lengthOf(points: readonly Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!)
  return total
}

/** Points every `spacing` along the path, the first and last included. */
function resample(points: readonly Point[], spacing: number): Point[] {
  const out: Point[] = [points[0]!]
  let carried = 0
  let prev = points[0]!
  for (let i = 1; i < points.length; i++) {
    const next = points[i]!
    let d = dist(prev, next)
    while (carried + d >= spacing) {
      const t = (spacing - carried) / d
      const q = { x: prev.x + t * (next.x - prev.x), y: prev.y + t * (next.y - prev.y) }
      out.push(q)
      prev = q
      d = dist(prev, next)
      carried = 0
    }
    carried += d
    prev = next
  }
  const last = points[points.length - 1]!
  if (dist(out[out.length - 1]!, last) > spacing / 2) out.push(last)
  else out[out.length - 1] = last
  return out
}

/** Distance from `p` to the segment `a`–`b`. */
function toSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Path lengths from the first point: `cum[i]` is the length up to point `i`. */
function cumulative(points: readonly Point[]): number[] {
  const cum = [0]
  for (let i = 1; i < points.length; i++)
    cum.push(cum[i - 1]! + dist(points[i - 1]!, points[i]!))
  return cum
}

/**
 * Corner indices of the loop `r` (its last point joins its first), in order round it. A corner
 * is where the path turns sharply over a few samples: outward by more than `CONVEX_TURN`, or
 * back against the loop's own direction (a star's inner corner) by more than `CONCAVE_TURN`.
 */
function cornersOf(r: readonly Point[]): number[] {
  const n = r.length
  if (n < 2 * W + 2) return []
  const at = (i: number): Point => r[((i % n) + n) % n]!
  const direction = Math.sign(winding(r, centroid(r))) || 1
  const turns = r.map((p, i) => {
    const a = at(i - W)
    const b = at(i + W)
    const turn = Math.atan2(b.y - p.y, b.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x)
    return (
      direction *
      (turn > Math.PI ? turn - 2 * Math.PI : turn < -Math.PI ? turn + 2 * Math.PI : turn)
    )
  })
  /** 1 for an outward corner, -1 for an inward one, 0 for none. */
  const kind = (i: number): number =>
    turns[i]! > CONVEX_TURN ? 1 : turns[i]! < -CONCAVE_TURN ? -1 : 0
  // Each run of sharp turns one way is one corner, at its sharpest. Start where no run is.
  const start = turns.findIndex((_, i) => kind(i) === 0)
  if (start < 0) return []
  const corners: number[] = []
  let best: number | undefined
  for (let k = 0; k <= n; k++) {
    const i = (start + k) % n
    const c = k < n ? kind(i) : 0
    if (best !== undefined && c !== kind(best)) {
      corners.push(best)
      best = undefined
    }
    if (c !== 0 && (best === undefined || Math.abs(turns[i]!) > Math.abs(turns[best]!)))
      best = i
  }
  corners.sort((a, b) => a - b)
  // A jog where the stroke's ends meet can split one corner into two close together: keep the
  // sharper.
  for (let k = 0; corners.length > 1 && k < corners.length;) {
    const next = (k + 1) % corners.length
    if ((corners[next]! - corners[k]! + n) % n > 2 * W) k++
    else
      corners.splice(
        Math.abs(turns[corners[k]!]!) < Math.abs(turns[corners[next]!]!) ? k : next,
        1
      )
  }
  return mergeStraight(r, corners)
}

/** Drops corners whose neighbours run straight through them, the straightest first. */
function mergeStraight(r: readonly Point[], corners: number[]): number[] {
  const cum = cumulative(r)
  const total = cum[cum.length - 1]! + dist(r[r.length - 1]!, r[0]!)
  const arc = (a: number, b: number): number =>
    b > a ? cum[b]! - cum[a]! : total - cum[a]! + cum[b]!
  const out = [...corners]
  while (out.length > 3) {
    let drop = -1
    let straightest = MERGE_STRAIGHT
    for (let k = 0; k < out.length; k++) {
      const p = out[(k - 1 + out.length) % out.length]!
      const q = out[(k + 1) % out.length]!
      const a = arc(p, q)
      const ratio = a === 0 ? 1 : dist(r[p]!, r[q]!) / a
      if (ratio > straightest) {
        straightest = ratio
        drop = k
      }
    }
    if (drop < 0) break
    out.splice(drop, 1)
  }
  return out
}

/** Times the path winds round `c`, signed. */
function winding(points: readonly Point[], c: Point): number {
  let total = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    let d = Math.atan2(b.y - c.y, b.x - c.x) - Math.atan2(a.y - c.y, a.x - c.x)
    if (d > Math.PI) d -= 2 * Math.PI
    if (d < -Math.PI) d += 2 * Math.PI
    total += d
  }
  return total / (2 * Math.PI)
}

/** Largest and mean distance of `points` from the line through `a` and `b`, over `|ab|`. */
function deviation(
  points: readonly Point[],
  a: Point,
  b: Point
): { max: number; mean: number } {
  const len = dist(a, b)
  if (len === 0 || points.length === 0) return { max: Infinity, mean: Infinity }
  let max = 0
  let sum = 0
  for (const p of points) {
    const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len
    max = Math.max(max, d)
    sum += d
  }
  return { max: max / len, mean: sum / points.length / len }
}

/** How straight a run from `a` to `b` is: 1 on the chord, falling as the path strays from it. */
function straightness(points: readonly Point[], a: Point, b: Point): number {
  const dev = deviation(points, a, b)
  const bend = 1 - dist(a, b) / lengthOf(points)
  return clamp01(1 - LINE_MAX * dev.max - LINE_MEAN * dev.mean - 2 * bend)
}

function fitLine(r: readonly Point[]): Fit | undefined {
  const a = r[0]!
  const b = r[r.length - 1]!
  if (dist(a, b) / lengthOf(r) < 0.8) return undefined
  return {
    shape: { kind: 'line', start: pt(a), end: pt(b) },
    score: straightness(r, a, b),
  }
}

/** An arrow whose head is drawn at the end of `r`: a straight shaft, then a short fold back. */
function fitArrow(r: readonly Point[]): Fit | undefined {
  // The tip is where the path first gets (nearly) as far from its start as it ever does: a
  // head with two barbs comes back to the tip, and the second visit may reach a little further.
  const from = r.map((p) => dist(p, r[0]!))
  const far = Math.max(...from)
  let tipAt = from.findIndex((d) => d >= 0.97 * far)
  while (tipAt + 1 < r.length && from[tipAt + 1]! > from[tipAt]!) tipAt++
  const shaft = r.slice(0, tipAt + 1)
  const head = r.slice(tipAt + 1)
  const tail = r[0]!
  const tip = r[tipAt]!
  const shaftLength = lengthOf(shaft)
  const headLength = lengthOf([tip, ...head])
  const total = shaftLength + headLength
  if (shaftLength < 0.6 * total || headLength < 0.06 * shaftLength) return undefined
  const along = { x: (tip.x - tail.x) / shaftLength, y: (tip.y - tail.y) / shaftLength }
  const chord = dist(tail, tip)
  if (chord / shaftLength < STRAIGHT) return undefined
  // The head stays near the tip, folds back from it, and leaves the shaft's line.
  let off = 0
  for (const p of head) {
    if (dist(p, tip) > 0.4 * chord) return undefined
    if ((p.x - tip.x) * along.x + (p.y - tip.y) * along.y > 0.08 * chord) return undefined
    off = Math.max(off, Math.abs((p.x - tip.x) * along.y - (p.y - tip.y) * along.x))
  }
  if (off < 0.04 * chord) return undefined
  return {
    shape: { kind: 'arrow', start: pt(tail), end: pt(tip) },
    score: straightness(shaft, tail, tip),
  }
}

/**
 * The stroke as a loop, evenly spaced all the way round (the gap between its ends bridged), an
 * overshoot past its start trimmed; undefined when the stroke is open.
 */
function loopOf(r: readonly Point[], size: number, spacing: number): Point[] | undefined {
  const n = r.length
  if (n < 8) return undefined
  // The end may run past the start: close the loop where it comes nearest the start.
  let end = n - 1
  for (let i = Math.floor(n / 2); i < n; i++)
    if (dist(r[i]!, r[0]!) < dist(r[end]!, r[0]!)) end = i
  if (dist(r[end]!, r[0]!) > CLOSE_GAP * size || n - 1 - end > 0.25 * n) return undefined
  const loop = resample([...r.slice(0, end + 1), r[0]!], spacing)
  loop.pop()
  return loop
}

function fitEllipse(loop: readonly Point[], box: Rect): Fit | undefined {
  const rx = box.width / 2
  const ry = box.height / 2
  if (rx === 0 || ry === 0) return undefined
  const cx = box.x + rx
  const cy = box.y + ry
  let sum = 0
  for (const p of loop) sum += Math.abs(Math.hypot((p.x - cx) / rx, (p.y - cy) / ry) - 1)
  const mean = sum / loop.length
  return {
    shape: {
      kind: 'ellipse',
      rect: {
        x: round(box.x),
        y: round(box.y),
        width: round(box.width),
        height: round(box.height),
      },
    },
    score: clamp01(1 - 3 * mean),
  }
}

/** How closely the loop follows the polygon through `vertices`: 1 on it, falling with distance. */
function polygonFit(
  loop: readonly Point[],
  vertices: readonly Point[],
  size: number
): number {
  let sum = 0
  for (const p of loop) {
    let best = Infinity
    for (let i = 0; i < vertices.length; i++)
      best = Math.min(
        best,
        toSegment(p, vertices[i]!, vertices[(i + 1) % vertices.length]!)
      )
    sum += best
  }
  return clamp01(1 - (12 * sum) / loop.length / size)
}

/** Within `tolerance` radians of horizontal (0) or vertical (1); else -1. */
function axisOf(a: Point, b: Point, tolerance: number): { axis: number; off: number } {
  const angle = Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) % Math.PI
  const fromH = Math.min(angle, Math.PI - angle)
  const fromV = Math.abs(angle - Math.PI / 2)
  if (fromH <= tolerance) return { axis: 0, off: fromH }
  if (fromV <= tolerance) return { axis: 1, off: fromV }
  return { axis: -1, off: Math.PI / 4 }
}

function fitRectangle(vertices: readonly Point[], fit: number): Fit | undefined {
  if (vertices.length !== 4) return undefined
  const tolerance = (20 * Math.PI) / 180
  let worst = 0
  for (let i = 0; i < 4; i++) {
    const side = axisOf(vertices[i]!, vertices[(i + 1) % 4]!, tolerance)
    if (
      side.axis < 0 ||
      side.axis !== (axisOf(vertices[0]!, vertices[1]!, tolerance).axis + i) % 2
    )
      return undefined
    worst = Math.max(worst, side.off)
  }
  const xs = vertices.map((v) => v.x).sort((a, b) => a - b)
  const ys = vertices.map((v) => v.y).sort((a, b) => a - b)
  const left = (xs[0]! + xs[1]!) / 2
  const right = (xs[2]! + xs[3]!) / 2
  const bottom = (ys[0]! + ys[1]!) / 2
  const top = (ys[2]! + ys[3]!) / 2
  return {
    shape: {
      kind: 'rectangle',
      rect: {
        x: round(left),
        y: round(bottom),
        width: round(right - left),
        height: round(top - bottom),
      },
    },
    score: clamp01(fit - worst / tolerance / 10),
  }
}

/** The shape tool's star of `points` tips round `c`, tips at `radius`, the first at the top. */
function regularStar(c: Point, points: number, radius: number): Point[] {
  const box = { x: c.x - radius, y: c.y - radius, width: 2 * radius, height: 2 * radius }
  return starVertices(box, points).map(pt)
}

const centroid = (points: readonly Point[]): Point => ({
  x: points.reduce((s, p) => s + p.x, 0) / points.length,
  y: points.reduce((s, p) => s + p.y, 0) / points.length,
})

/** An outline star: an even number of corners alternating far from and near the centre. */
function fitStar(vertices: readonly Point[], fit: number): Fit | undefined {
  const k = vertices.length
  if (k % 2 !== 0 || k < 8 || k > 16) return undefined
  const c = centroid(vertices)
  const radii = vertices.map((v) => dist(v, c))
  const even = radii.filter((_, i) => i % 2 === 0)
  const odd = radii.filter((_, i) => i % 2 === 1)
  const [outer, inner] = Math.min(...even) > Math.max(...odd) ? [even, odd] : [odd, even]
  if (Math.min(...outer) <= Math.max(...inner)) return undefined
  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length
  const ratio = mean(inner) / mean(outer)
  if (ratio > 0.75) return undefined
  // Tips spread unevenly from the centre make a sloppier star.
  const spread = (Math.max(...outer) - Math.min(...outer)) / mean(outer)
  return {
    shape: { kind: 'star', vertices: regularStar(c, k / 2, mean(outer)) },
    score: clamp01(fit - Math.max(0, spread - 0.2)),
  }
}

/** A pentagram: five straight strokes that wind twice round the centre. */
function fitPentagram(
  vertices: readonly Point[],
  loop: readonly Point[],
  size: number
): Fit | undefined {
  if (vertices.length !== 5) return undefined
  const c = centroid(vertices)
  const turns = Math.abs(winding(loop, c))
  if (turns < 1.6 || turns > 2.4) return undefined
  const radii = vertices.map((v) => dist(v, c))
  const mean = radii.reduce((s, x) => s + x, 0) / radii.length
  const spread = (Math.max(...radii) - Math.min(...radii)) / mean
  return {
    shape: { kind: 'star', vertices: regularStar(c, 5, mean) },
    score: clamp01(polygonFit(loop, vertices, size) - Math.max(0, spread - 0.2)),
  }
}

/** True when two sides of the polygon through `v` cross. */
function crosses(v: readonly Point[]): boolean {
  const k = v.length
  const side = (a: Point, b: Point, c: Point): number =>
    Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  for (let i = 0; i < k; i++)
    for (let j = i + 2; j < k; j++) {
      if (i === 0 && j === k - 1) continue
      const [a, b, c, d] = [v[i]!, v[(i + 1) % k]!, v[j]!, v[(j + 1) % k]!]
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0)
        return true
    }
  return false
}

/** How straight the loop runs between consecutive corners: the worst side's score. */
function sidesFit(loop: readonly Point[], corners: readonly number[]): number {
  let worst = 1
  for (let k = 0; k < corners.length; k++) {
    const from = corners[k]!
    const to = corners[(k + 1) % corners.length]!
    const side =
      to > from
        ? loop.slice(from, to + 1)
        : [...loop.slice(from), ...loop.slice(0, to + 1)]
    const a = side[0]!
    const b = side[side.length - 1]!
    const bend = 1 - dist(a, b) / lengthOf(side)
    worst = Math.min(
      worst,
      clamp01(1 - SIDE_MEAN * deviation(side, a, b).mean - 2 * bend)
    )
  }
  return worst
}

function fitClosed(loop: readonly Point[], size: number): Fit[] {
  const box = boxOf(loop)
  const fits: Fit[] = []
  const corners = cornersOf(loop)
  const vertices = corners.map((i) => loop[i]!)
  const pentagram = fitPentagram(vertices, loop, size)
  if (pentagram) fits.push(pentagram)
  // Every other closed kind winds once round its middle.
  const turns = Math.abs(
    winding(loop, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  )
  if (turns < 0.8 || turns > 1.25) return fits
  const ellipse = fitEllipse(loop, box)
  if (ellipse) fits.push(ellipse)
  if (vertices.length < 3 || crosses(vertices)) return fits
  const fit = polygonFit(loop, vertices, size)
  const rectangle = fitRectangle(vertices, fit)
  if (rectangle) fits.push(rectangle)
  else if (vertices.length <= 8)
    fits.push({
      shape: { kind: 'polygon', vertices: vertices.map(pt) },
      score: Math.min(fit, sidesFit(loop, corners)),
    })
  const star = fitStar(vertices, fit)
  if (star) fits.push(star)
  return fits
}

/**
 * The standard shape a single freehand stroke (user space points, in drawing order) is closest
 * to, and how well it fits, from 0 to 1. Tidy the stroke only when the score reaches
 * `RECOGNISE_THRESHOLD`. Undefined when no shape fits at all.
 */
export function recogniseStroke(
  points: readonly Point[]
): { shape: Recognised; score: number } | undefined {
  const clean = points.filter(
    (p, i) =>
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      (i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y)
  )
  if (clean.length < 2) return undefined
  const size = diagonal(boxOf(clean))
  if (size === 0) return undefined
  // A long path in a small box (a scribble) would resample to thousands of points: cap them.
  const spacing = Math.max(size / DENSITY, lengthOf(clean) / 1000)
  const r = resample(clean, spacing)
  if (r.length < 2) return undefined
  const fits: Fit[] = []
  const line = fitLine(r)
  if (line) fits.push(line)
  const loop = loopOf(r, size, spacing)
  if (loop) fits.push(...fitClosed(loop, size))
  else {
    for (const f of [fitArrow(r), fitArrow([...r].reverse())]) if (f) fits.push(f)
  }
  let best: Fit | undefined
  for (const f of fits) if (!best || f.score > best.score) best = f
  return best && { shape: best.shape, score: round(best.score) }
}
