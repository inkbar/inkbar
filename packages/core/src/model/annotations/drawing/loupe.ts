import type { Rect } from '../../geometry'
import type { LoupeAnnotation } from '../types'
import type { Drawing } from './types'

/** The page region a loupe shows: its rect shrunk by the magnification about its centre. */
export function loupeRegion(a: Pick<LoupeAnnotation, 'rect' | 'magnification'>): Rect {
  const { rect, magnification } = a
  const width = rect.width / magnification
  const height = rect.height / magnification
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  }
}

/**
 * A loupe: the page region it magnifies, shown in its rect and clipped to the circle inscribed
 * in it, and the rim over that circle (inset by half its stroke, absent at width 0). A painter
 * draws the rim; whoever owns the lens draws the page region.
 */
export function describeLoupe(a: LoupeAnnotation): Drawing {
  const { rect } = a
  const inset = a.width / 2
  return {
    layer: 'annotation',
    bounds: rect,
    items: [
      {
        kind: 'page',
        source: loupeRegion(a),
        target: rect,
        clip: {
          center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
          radius: Math.min(rect.width, rect.height) / 2,
        },
      },
      ...(a.width > 0
        ? [
            {
              kind: 'group' as const,
              opacity: a.opacity,
              items: [
                {
                  kind: 'ellipse' as const,
                  role: 'loupe-rim' as const,
                  rect: {
                    x: rect.x + inset,
                    y: rect.y + inset,
                    width: Math.max(0, rect.width - a.width),
                    height: Math.max(0, rect.height - a.width),
                  },
                  paint: { stroke: { color: a.color, width: a.width } },
                },
              ],
            },
          ]
        : []),
    ],
  }
}
