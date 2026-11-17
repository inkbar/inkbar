import { describeInk } from './ink'
import { describeLine } from './lines'
import { describeLoupe } from './loupe'
import { describeMarkup, describeRedact } from './markup'
import { describeMask } from './mask'
import { describeShape } from './shapes'
import { describeStamp } from './stamp'

import type { Annotation } from '../types'
import type { DrawContext, Drawing } from './types'

/**
 * The drawing of `a`, or `undefined` for one this does not describe: a reply, an annotation the
 * page canvas paints, or (for now) any type the overlay still draws itself.
 */
export function describeAnnotation(
  a: Annotation,
  context: DrawContext
): Drawing | undefined {
  switch (a.type) {
    case 'highlight':
    case 'underline':
    case 'strikeout':
    case 'squiggly':
      return describeMarkup(a)
    case 'redact':
      return describeRedact(a)
    case 'square':
    case 'circle':
      return describeShape(a)
    case 'line':
    case 'polyline':
    case 'polygon':
      return describeLine(a)
    case 'ink':
      return describeInk(a)
    case 'stamp':
      return describeStamp(a)
    case 'loupe':
      return describeLoupe(a)
    case 'mask':
      return describeMask(a, context)
    default:
      return undefined
  }
}
