import type { ShapeAnnotation } from '../types'
import type { Drawing } from './types'

/** A square or circle: a rect or ellipse inset by half its stroke, in a group. */
export function describeShape(a: ShapeAnnotation): Drawing {
  const inset = a.width / 2
  const rect = {
    x: a.rect.x + inset,
    y: a.rect.y + inset,
    width: Math.max(0, a.rect.width - a.width),
    height: Math.max(0, a.rect.height - a.width),
  }
  const paint = {
    ...(a.interiorColor ? { fill: { color: a.interiorColor } } : {}),
    stroke: {
      color: a.color,
      width: a.width,
      ...(a.dashes?.length ? { dashes: a.dashes } : {}),
    },
  }
  return {
    layer: 'annotation',
    bounds: a.rect,
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
