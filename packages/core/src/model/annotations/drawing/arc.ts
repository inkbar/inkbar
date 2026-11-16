import type { PathCommand } from './types'
import type { Point } from '../../geometry'

type Arc = Extract<PathCommand, { op: 'A' }>
type Cubic = Extract<PathCommand, { op: 'C' }>

/**
 * An SVG elliptical arc from `from` as cubic Béziers, one per quarter turn at most. Radii too
 * small for the chord are scaled up as SVG does; a zero-length arc gives none, and one with a
 * zero radius (which SVG draws as a straight line) gives one straight cubic. Axis-aligned ellipses only, as `A` has no
 * rotation.
 */
export function arcToCubics(from: Point, arc: Arc): Cubic[] {
  const { to } = arc
  if (from.x === to.x && from.y === to.y) return []
  let rx = Math.abs(arc.rx)
  let ry = Math.abs(arc.ry)
  // SVG draws a straight line when a radius is zero.
  if (rx === 0 || ry === 0)
    return [{ op: 'C', c1: { ...from }, c2: { ...to }, to: { ...to } }]
  // Endpoint to centre parameterisation (SVG 1.1 implementation notes F.6.5), phi = 0.
  const dx = (from.x - to.x) / 2
  const dy = (from.y - to.y) / 2
  const lambda = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }
  const num = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx
  const den = rx * rx * dy * dy + ry * ry * dx * dx
  const sign = arc.largeArc === arc.sweep ? -1 : 1
  const k = sign * Math.sqrt(Math.max(0, num / den))
  const cxp = (k * rx * dy) / ry
  const cyp = (-k * ry * dx) / rx
  const cx = cxp + (from.x + to.x) / 2
  const cy = cyp + (from.y + to.y) / 2
  const start = Math.atan2((dy - cyp) / ry, (dx - cxp) / rx)
  const end = Math.atan2((-dy - cyp) / ry, (-dx - cxp) / rx)
  let sweepAngle = end - start
  // `sweep` is the direction of increasing angle in SVG's y-down space, which is the angle
  // direction used here.
  if (arc.sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI
  else if (!arc.sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI
  const count = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2) - 1e-9))
  const step = sweepAngle / count
  const t = (4 / 3) * Math.tan(step / 4)
  const out: Cubic[] = []
  const at = (a: number): Point => ({
    x: cx + rx * Math.cos(a),
    y: cy + ry * Math.sin(a),
  })
  const tangent = (a: number): Point => ({ x: -rx * Math.sin(a), y: ry * Math.cos(a) })
  for (let i = 0; i < count; i++) {
    const a0 = start + i * step
    const a1 = a0 + step
    const p0 = at(a0)
    const p1 = i === count - 1 ? { x: to.x, y: to.y } : at(a1)
    const d0 = tangent(a0)
    const d1 = tangent(a1)
    out.push({
      op: 'C',
      c1: { x: p0.x + t * d0.x, y: p0.y + t * d0.y },
      c2: { x: p1.x - t * d1.x, y: p1.y - t * d1.y },
      to: p1,
    })
  }
  return out
}
