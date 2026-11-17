import type { StampAnnotation } from '../types'
import type { Drawing } from './types'

/**
 * A stamp: its image in its rect, in a group that carries the opacity. `angle` is the page
 * turn the stamp was placed for, so a signature reads upright as the file displays it.
 */
export function describeStamp(a: StampAnnotation): Drawing {
  return {
    layer: 'annotation',
    bounds: a.rect,
    items: [
      {
        kind: 'group',
        opacity: a.opacity,
        items: [
          {
            kind: 'image',
            role: 'stamp',
            data: a.imagedata,
            rect: a.rect,
            angle: a.rotation ?? 0,
          },
        ],
      },
    ],
  }
}
