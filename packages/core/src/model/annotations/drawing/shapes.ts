import { strokeInset } from './extent'

import type { ShapeAnnotation } from '../types'
import type { Drawing, Paint } from './types'

/**
 * A square or circle: a rect or ellipse inset by half its stroke, in a group. A box narrower
 * than its stroke collapses to its centre line, so the shape stays centred in `rect`, and the
 * bounds then reach past `rect` by what the stroke needs. A stroke of no width is not drawn.
 */
export function describeShape(a: ShapeAnnotation): Drawing {
  const { inset: rect, reach } = strokeInset(a.rect, a.width)
  const paint: Paint = {
    ...(a.interiorColor ? { fill: { color: a.interiorColor } } : {}),
    ...(a.width > 0
      ? {
          stroke: {
            color: a.color,
            width: a.width,
            ...(a.dashes?.length ? { dashes: a.dashes } : {}),
          },
        }
      : {}),
  }
  return {
    layer: 'annotation',
    bounds: reach,
    items: [
      {
        kind: 'group',
        opacity: a.opacity,
        items: [
          a.type === 'square'
            ? {
                kind: 'rect',
                rect,
                ...(a.cornerRadius ? { radius: a.cornerRadius } : {}),
                paint,
              }
            : { kind: 'ellipse', rect, paint },
        ],
      },
    ],
  }
}
