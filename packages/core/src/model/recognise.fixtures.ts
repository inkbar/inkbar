// Strokes for the recogniser's tests, in user space (points). Each is a clean path traced the
// way a hand would draw it (one stroke, a sample every few points), then roughened: a slow
// wobble across the path plus per-sample jitter. A seeded generator makes every run the same.
import type { Point } from './geometry'

/** mulberry32: a small seeded generator returning values in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Samples along a polyline every `step` points, its corners included. */
export function trace(corners: readonly Point[], step = 3): Point[] {
  const out: Point[] = [corners[0]!]
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1]!
    const b = corners[i]!
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let k = 1; k <= n; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
  }
  return out
}

/** Samples `f(t)` for `t` from `t0` to `t1` in `n` steps. */
export function curve(
  f: (t: number) => Point,
  t0: number,
  t1: number,
  n: number
): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => f(t0 + ((t1 - t0) * i) / n))
}

/**
 * Roughens a path: a slow sideways wobble of up to `wobble` points (a hand's drift) and
 * per-sample jitter of up to `jitter` points.
 */
export function roughen(
  points: readonly Point[],
  seed: number,
  { wobble = 1.5, jitter = 0.6 }: { wobble?: number; jitter?: number } = {}
): Point[] {
  const rand = seeded(seed)
  const phase = [rand() * Math.PI * 2, rand() * Math.PI * 2]
  const freq = [2 + rand() * 2, 5 + rand() * 3]
  const n = Math.max(1, points.length - 1)
  return points.map((p, i) => {
    const t = i / n
    const drift = (k: number) => Math.sin(t * freq[k]! + phase[k]!) * wobble
    return {
      x: p.x + drift(0) + (rand() * 2 - 1) * jitter,
      y: p.y + drift(1) + (rand() * 2 - 1) * jitter,
    }
  })
}

/** A star outline's vertices: `points` tips at radius `outer`, inner corners at `inner`. */
function starOutline(c: Point, points: number, outer: number, inner: number): Point[] {
  return Array.from({ length: points * 2 + 1 }, (_, i) => {
    const angle = Math.PI / 2 + (i * Math.PI) / points
    const r = i % 2 === 0 ? outer : inner
    return { x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) }
  })
}

/** A random walk with momentum, bounced inside a box: a scribble. */
function scribble(seed: number): Point[] {
  const rand = seeded(seed)
  let p = { x: 150, y: 150 }
  let angle = rand() * Math.PI * 2
  const out: Point[] = [p]
  for (let i = 0; i < 260; i++) {
    angle += (rand() * 2 - 1) * 1.1
    p = { x: p.x + Math.cos(angle) * 4, y: p.y + Math.sin(angle) * 4 }
    if (p.x < 100 || p.x > 200) angle = Math.PI - angle
    if (p.y < 100 || p.y > 200) angle = -angle
    p = { x: Math.min(Math.max(p.x, 100), 200), y: Math.min(Math.max(p.y, 100), 200) }
    out.push(p)
  }
  return out
}

export const FIXTURES: Record<string, Point[]> = {
  'wobbly line': roughen(
    trace([
      { x: 100, y: 100 },
      { x: 300, y: 160 },
    ]),
    1,
    { wobble: 2 }
  ),
  'line with a hook at the end': roughen(
    trace([
      { x: 100, y: 300 },
      { x: 300, y: 320 },
      { x: 281, y: 333 },
    ]),
    2
  ),
  'arrow with both barbs': roughen(
    trace([
      { x: 120, y: 120 },
      { x: 260, y: 260 },
      { x: 258, y: 236 },
      { x: 260, y: 260 },
      { x: 236, y: 258 },
    ]),
    3
  ),
  'arrow drawn head first': roughen(
    trace([
      { x: 118, y: 412 },
      { x: 100, y: 400 },
      { x: 300, y: 400 },
    ]),
    4
  ),
  'rough box': roughen(
    trace([
      { x: 104, y: 220 },
      { x: 100, y: 100 },
      { x: 260, y: 102 },
      { x: 262, y: 222 },
      { x: 98, y: 218 },
      { x: 100, y: 200 },
    ]),
    5,
    { wobble: 2 }
  ),
  'rough circle': roughen(
    curve(
      (t) => {
        const r = 60 * (1 + 0.04 * Math.sin(t * 3 + 1))
        return { x: 200 + r * Math.cos(t), y: 200 + r * Math.sin(t) }
      },
      0.7,
      0.7 + Math.PI * 2 * 1.06,
      120
    ),
    6
  ),
  'flat ellipse': roughen(
    curve(
      (t) => ({ x: 200 + 110 * Math.cos(t), y: 300 + 45 * Math.sin(t) }),
      Math.PI,
      Math.PI - Math.PI * 2 * 0.97,
      120
    ),
    7
  ),
  triangle: roughen(
    trace([
      { x: 100, y: 100 },
      { x: 260, y: 110 },
      { x: 170, y: 240 },
      { x: 103, y: 104 },
    ]),
    8,
    { wobble: 2 }
  ),
  'five-point star': roughen(trace(starOutline({ x: 200, y: 200 }, 5, 80, 32), 3), 9, {
    wobble: 1.5,
  }),
  pentagram: roughen(
    trace(
      [0, 2, 4, 1, 3, 0].map((i) => {
        const angle = Math.PI / 2 + (i * 2 * Math.PI) / 5
        return { x: 200 + 80 * Math.cos(angle), y: 200 + 80 * Math.sin(angle) }
      })
    ),
    10
  ),
  'signature scrawl': roughen(
    curve(
      // A prolate cycloid: a run of cursive loops, growing and shrinking like letters.
      (t) => {
        const d = 14 + 6 * Math.sin(t * 0.7)
        return { x: 100 + 7 * t - d * Math.sin(t), y: 200 + 12 - d * Math.cos(t) }
      },
      0,
      Math.PI * 9,
      360
    ),
    11
  ),
  zigzag: roughen(
    trace(
      Array.from({ length: 9 }, (_, i) => ({
        x: 100 + i * 22,
        y: i % 2 === 0 ? 100 : 160,
      }))
    ),
    12
  ),
  spiral: roughen(
    curve(
      (t) => {
        const r = 6 + 9 * t
        return { x: 200 + r * Math.cos(t), y: 200 + r * Math.sin(t) }
      },
      0,
      Math.PI * 5,
      200
    ),
    13
  ),
  scribble: scribble(14),
  // A bow whose middle stands 15% of its span off the chord: a curve, not a line.
  arc: roughen(
    curve(
      (t) => ({ x: 200 + 216.7 * Math.sin(t), y: 100 + 216.7 * Math.cos(t) }),
      -0.4949,
      0.4949,
      70
    ),
    15
  ),
}
