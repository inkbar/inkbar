import { unionRects } from '../../geometry'

import type { MaskAnnotation } from '../types'
import type { DrawContext, Drawing, PathCommand } from './types'

/**
 * A mask: the page's box with its shape cut out (an even-odd path), filled with the mask's
 * colour at its `dim`. It belongs to the page, under every annotation; the mask's own element
 * carries only the edge that takes presses.
 */
export function describeMask(a: MaskAnnotation, context: DrawContext): Drawing {
  const { box } = context.page
  const { rect } = a
  const right = box.x + box.width
  const top = box.y + box.height
  const page: PathCommand[] = [
    { op: 'M', to: { x: box.x, y: box.y } },
    { op: 'L', to: { x: right, y: box.y } },
    { op: 'L', to: { x: right, y: top } },
    { op: 'L', to: { x: box.x, y: top } },
    { op: 'Z' },
  ]
  let shape: PathCommand[]
  if (a.shape === 'ellipse') {
    const cy = rect.y + rect.height / 2
    const arc = (x: number): PathCommand => ({
      op: 'A',
      rx: rect.width / 2,
      ry: rect.height / 2,
      largeArc: true,
      sweep: true,
      to: { x, y: cy },
    })
    shape = [
      { op: 'M', to: { x: rect.x, y: cy } },
      arc(rect.x + rect.width),
      arc(rect.x),
      { op: 'Z' },
    ]
  } else {
    shape = [
      { op: 'M', to: { x: rect.x, y: rect.y } },
      { op: 'L', to: { x: rect.x + rect.width, y: rect.y } },
      { op: 'L', to: { x: rect.x + rect.width, y: rect.y + rect.height } },
      { op: 'L', to: { x: rect.x, y: rect.y + rect.height } },
      { op: 'Z' },
    ]
  }
  return {
    layer: 'page',
    // The shape may reach past the page, and what an even-odd fill paints there is outside it.
    bounds: unionRects([box, rect]),
    items: [
      {
        kind: 'path',
        role: 'mask',
        commands: [...page, ...shape],
        fillRule: 'evenodd',
        paint: { fill: { color: a.color, opacity: a.dim } },
      },
    ],
  }
}
