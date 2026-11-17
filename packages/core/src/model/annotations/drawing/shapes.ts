import { strokeInset } from './extent'

import type { ShapeAnnotation } from '../types'
import type { Drawing, Paint } from './types'

/**
 * A square or circle: a rect or ellipse inset by half its stroke, in a group. A box narrower
 * than its stroke collapses to its centre line, so the shape stays centred in `rect`, and the
 * bounds then reach past `rect` by what the stroke needs. A box the stroke fills entirely, in
 * either dimension, is described as a filled shape in the stroke colour over its reach, with no
 * stroke or dashes. A stroke of no width is not drawn.
 */
export function describeShape(a: ShapeAnnotation): Drawing {
  const { inset: rect, reach } = strokeInset(a.rect, a.width)
  // One corner radius, circular: no more than half the shorter side, however a painter clamps.
  const radius = Math.min(a.cornerRadius ?? 0, rect.width / 2, rect.height / 2)
  // A stroke wider than the box leaves nothing to outline: SVG draws no rect or ellipse of no
  // width or height, and a file would stroke it as a line. The border filling its box is a
  // filled shape in the stroke colour over what the stroke reaches, with no stroke.
  const collapsed = a.width > 0 && (rect.width <= 0 || rect.height <= 0)
  if (collapsed) {
    const fill: Paint = { fill: { color: a.color } }
    return {
      layer: 'annotation',
      bounds: reach,
      items: [
        {
          kind: 'group',
          opacity: a.opacity,
          items: [
            a.type === 'square'
              ? { kind: 'rect', rect: reach, paint: fill }
              : { kind: 'ellipse', rect: reach, paint: fill },
          ],
        },
      ],
    }
  }
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
                ...(radius > 0 ? { radius } : {}),
                paint,
              }
            : { kind: 'ellipse', rect, paint },
        ],
      },
    ],
  }
}
