import { unionRects } from '../../geometry'
import { isKnown, LINE_ENDINGS } from '../pdf-names'

import { paintedRect } from './extent'

import type { Point } from '../../geometry'
import type { LineAnnotation, LineEnding, PolyAnnotation } from '../types'
import type { DrawItem, Drawing, Paint, PathCommand } from './types'

/** An ending's length, and its full width, as a multiple of the stroke width (at least one point). */
const ENDING_SCALE = 3

/** Endings that are solid shapes: filled with the stroke colour. */
const FILLED_ENDINGS: ReadonlySet<LineEnding> = new Set([
  'ClosedArrow',
  'RClosedArrow',
  'Square',
  'Circle',
  'Diamond',
])

/**
 * A line ending at `at`, pointing from `from` towards `at`, or `undefined` for none, a name
 * that is not drawn, or a zero-length segment. Arrows are three strokes long and the rest three
 * across, with the stroke counted as at least one point.
 */
export function endingItem(
  kind: LineEnding,
  at: Point,
  from: Point,
  width: number,
  color: string,
  role: 'ending-head' | 'ending-tail'
): DrawItem | undefined {
  const length = Math.hypot(at.x - from.x, at.y - from.y)
  if (!isKnown(LINE_ENDINGS, kind) || kind === 'None' || !(length > 0)) return undefined
  const size = ENDING_SCALE * Math.max(width, 1)
  const half = size / 2
  const ux = (at.x - from.x) / length
  const uy = (at.y - from.y) / length
  // The y axis points up here, so the normal that is clockwise on screen is (uy, -ux).
  const nx = uy
  const ny = -ux
  const pt = (along: number, across: number): Point => ({
    x: at.x + ux * along + nx * across,
    y: at.y + uy * along + ny * across,
  })
  const move = (to: Point): PathCommand => ({ op: 'M', to })
  const line = (to: Point): PathCommand => ({ op: 'L', to })
  const close: PathCommand = { op: 'Z' }
  let commands: PathCommand[]
  switch (kind) {
    case 'OpenArrow':
      commands = [move(pt(-size, -half)), line(pt(0, 0)), line(pt(-size, half))]
      break
    case 'ClosedArrow':
      commands = [move(pt(-size, -half)), line(pt(0, 0)), line(pt(-size, half)), close]
      break
    case 'ROpenArrow':
      commands = [move(pt(0, -half)), line(pt(-size, 0)), line(pt(0, half))]
      break
    case 'RClosedArrow':
      commands = [move(pt(0, -half)), line(pt(-size, 0)), line(pt(0, half)), close]
      break
    case 'Square':
      commands = [
        move(pt(-half, -half)),
        line(pt(half, -half)),
        line(pt(half, half)),
        line(pt(-half, half)),
        close,
      ]
      break
    case 'Diamond':
      commands = [
        move(pt(-half, 0)),
        line(pt(0, -half)),
        line(pt(half, 0)),
        line(pt(0, half)),
        close,
      ]
      break
    case 'Circle': {
      const arc = (to: Point): PathCommand => ({
        op: 'A',
        rx: half,
        ry: half,
        largeArc: true,
        sweep: true,
        to,
      })
      commands = [move(pt(half, 0)), arc(pt(-half, 0)), arc(pt(half, 0)), close]
      break
    }
    case 'Butt':
      commands = [move(pt(0, -half)), line(pt(0, half))]
      break
    case 'Slash': {
      // Tilted 30 degrees from the butt, as PDF draws it.
      const s = Math.sin(Math.PI / 6) * half
      const c = Math.cos(Math.PI / 6) * half
      commands = [move(pt(-s, -c)), line(pt(s, c))]
      break
    }
    default:
      return undefined
  }
  const paint: Paint = {
    ...(FILLED_ENDINGS.has(kind) ? { fill: { color } } : {}),
    ...(width > 0
      ? {
          stroke: {
            color,
            width,
            join: 'round' as const,
            // A butt or slash ending is a cut across the line: a round cap would blunt it.
            cap:
              kind === 'Butt' || kind === 'Slash'
                ? ('butt' as const)
                : ('round' as const),
          },
        }
      : {}),
  }
  return { kind: 'path', role, commands, paint }
}

/** A line, polyline or polygon: the shaft in a group that carries the opacity, then its endings. */
export function describeLine(a: LineAnnotation | PolyAnnotation): Drawing {
  const points = a.type === 'line' ? [a.start, a.end] : a.vertices
  const paint: Paint = {
    ...(a.type === 'polygon' && a.interiorColor
      ? { fill: { color: a.interiorColor } }
      : {}),
    ...(a.width > 0
      ? {
          stroke: {
            color: a.color,
            width: a.width,
            ...(a.dashes?.length ? { dashes: a.dashes } : {}),
            join: 'round' as const,
          },
        }
      : {}),
  }
  const items: DrawItem[] = [
    { kind: a.type === 'polygon' ? 'polygon' : 'polyline', points, paint },
  ]
  if (a.type !== 'polygon' && points.length >= 2) {
    const first = points[0]!
    const second = points[1]!
    const last = points[points.length - 1]!
    const before = points[points.length - 2]!
    for (const [kind, tip, other, role] of [
      [a.head, first, second, 'ending-head'],
      [a.tail, last, before, 'ending-tail'],
    ] as const) {
      const ending = kind && endingItem(kind, tip, other, a.width, a.color, role)
      if (ending) {
        items.push(ending)
      }
    }
  }
  // An ending with neither a fill nor a stroke (a stroke-only shape on a line of no width)
  // paints nothing, so it does not widen the bounds.
  const painted = items.flatMap((i) =>
    i.kind === 'path' && !i.paint.fill && !i.paint.stroke ? [] : (paintedRect(i) ?? [])
  )
  return {
    layer: 'annotation',
    // A line with no points paints nothing: its bounds are its rect's corner.
    bounds:
      painted.length > 0
        ? unionRects(painted)
        : { x: a.rect.x, y: a.rect.y, width: 0, height: 0 },
    items: [{ kind: 'group', opacity: a.opacity, items }],
  }
}
