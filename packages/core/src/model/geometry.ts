/**
 * All geometry in this module is PDF default user space: points, origin at the
 * lower-left of the page, before /Rotate. Pixel conversions live in dom/transform.ts.
 */
export interface Point {
  x: number
  y: number
}

/** Axis-aligned box. `x`,`y` is the lower-left corner. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Four corners in PDF.js's normalised QuadPoints order: upper-left, upper-right, lower-left, lower-right. */
export interface Quad {
  p1: Point
  p2: Point
  p3: Point
  p4: Point
}

/** PDF transformation matrix [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = readonly [number, number, number, number, number, number]

export function approxEqual(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) <= eps
}

export function rectFromPoints(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

export function rectFromQuad(q: Quad): Rect {
  const xs = [q.p1.x, q.p2.x, q.p3.x, q.p4.x]
  const ys = [q.p1.y, q.p2.y, q.p3.y, q.p4.y]
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

export function quadFromRect(r: Rect): Quad {
  const top = r.y + r.height
  const right = r.x + r.width
  return {
    p1: { x: r.x, y: top },
    p2: { x: right, y: top },
    p3: { x: r.x, y: r.y },
    p4: { x: right, y: r.y },
  }
}

/** One quad covering `r`, in the corner order of `quadFromRect`. */
export function quadsFromRect(r: Rect): Quad[] {
  return [quadFromRect(r)]
}

/** The bounding box of every corner of `quads`. */
export function rectFromQuads(quads: readonly Quad[]): Rect {
  if (quads.length === 0) throw new RangeError('rectFromQuads needs at least one quad')
  return unionRects(quads.map(rectFromQuad))
}

export function unionRects(rects: readonly Rect[]): Rect {
  if (rects.length === 0) throw new RangeError('unionRects needs at least one rect')
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.width)
    y2 = Math.max(y2, r.y + r.height)
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  )
}

export function rectContainsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
}

/**
 * Whether `p` is inside `q` or on its edge. A quad's corners run top-left, top-right,
 * bottom-left, bottom-right (PDF QuadPoints order), so its outline is p1, p2, p4, p3. Works for
 * any convex quad, whichever way round it winds. A quad with no area (a point or a line, as a
 * malformed file may give) contains nothing.
 */
export function quadContainsPoint(q: Quad, p: Point): boolean {
  const ring = [q.p1, q.p2, q.p4, q.p3]
  let area = 0
  for (let i = 0; i < 4; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % 4]!
    area += a.x * b.y - b.x * a.y
  }
  if (area === 0) return false
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % 4]!
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (cross === 0) continue
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

export function translateRect(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, width: r.width, height: r.height }
}

export function translateQuad(q: Quad, dx: number, dy: number): Quad {
  const t = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy })
  return { p1: t(q.p1), p2: t(q.p2), p3: t(q.p3), p4: t(q.p4) }
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }
}

export function invertMatrix(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2]
  if (det === 0) throw new RangeError('matrix is not invertible')
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ]
}

/** Returns the matrix that applies `a` first, then `b`. */
export function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ]
}

export function pointsFromFlat(flat: ArrayLike<number>): Point[] {
  const out: Point[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i]!, y: flat[i + 1]! })
  return out
}

/** Eight numbers per quad, in PDF.js's normalised order. Trailing partial quads are dropped. */
export function quadsFromFlat(flat: ArrayLike<number>): Quad[] {
  const pts = pointsFromFlat(flat)
  const out: Quad[] = []
  for (let i = 0; i + 3 < pts.length; i += 4) {
    out.push({ p1: pts[i]!, p2: pts[i + 1]!, p3: pts[i + 2]!, p4: pts[i + 3]! })
  }
  return out
}
