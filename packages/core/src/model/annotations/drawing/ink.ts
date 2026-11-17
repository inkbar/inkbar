import { getStroke } from 'perfect-freehand'

import type { Point, Rect } from '../../geometry'
import type { InkAnnotation } from '../types'
import type { DrawItem, Drawing, PathCommand } from './types'

/**
 * `perfect-freehand` has two absolute lengths of its own: a one-point stroke gets a second
 * point at +(1, 1), and the last 3 units of a stroke lose their sample points. Counted in
 * points they would reshape a stroke with the zoom it was drawn at, and a stroke here is
 * described once, for every zoom. The input is scaled up by this factor and the outline
 * scaled back down, which leaves both lengths a fraction of a point (a dot stays round) and
 * every other option, all relative to the width, as it was.
 */
const SCALE = 64

/**
 * The polygon around a stroke in points: `width` is in points; without `pressure` the line
 * keeps an even width. Used for described ink and the live preview, and nothing else: the
 * signature pad uses `strokeOutline` in `dom/ink-stroke`.
 */
export function inkOutline(
  points: readonly Point[],
  pressure: readonly number[] | undefined,
  width: number
): Point[] {
  const withPressure = pressure !== undefined
  const input = points.map(
    (p, i) => [p.x * SCALE, p.y * SCALE, pressure?.[i] ?? 0.5] as [number, number, number]
  )
  return getStroke(input, {
    size: width * SCALE,
    thinning: withPressure ? 0.5 : 0,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false,
  }).map(([x, y]) => ({ x: x / SCALE, y: y / SCALE }))
}

/**
 * An ink annotation: every stroke a smoothed, filled outline, thinned by pressure when there
 * is some, in a group that carries the opacity. Dashes do not apply to a filled outline.
 */
export function describeInk(a: InkAnnotation): Drawing {
  const items: DrawItem[] = []
  const all: Point[] = []
  a.inklist.forEach((stroke, i) => {
    // A stroke with nothing to outline is still an item with no commands: the overlay draws an
    // empty path for it, as it always has.
    const outline =
      stroke.length === 0 ? [] : inkOutline(stroke, a.pressure?.[i], a.width)
    all.push(...outline)
    const commands: PathCommand[] =
      outline.length === 0
        ? []
        : [
            ...outline.map((to, j): PathCommand => ({ op: j === 0 ? 'M' : 'L', to })),
            { op: 'Z' },
          ]
    items.push({
      kind: 'path',
      role: 'stroke',
      commands,
      paint: { fill: { color: a.color } },
    })
  })
  return {
    layer: 'annotation',
    bounds:
      all.length > 0
        ? pointBounds(all)
        : { x: a.rect.x, y: a.rect.y, width: 0, height: 0 },
    items: [{ kind: 'group', opacity: a.opacity, items }],
  }
}

function pointBounds(points: readonly Point[]): Rect {
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
