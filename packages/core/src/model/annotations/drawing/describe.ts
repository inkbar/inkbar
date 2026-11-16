import type { Annotation } from '../types'
import type { DrawContext, Drawing } from './types'

/**
 * The drawing of `a`, or `undefined` for one this does not describe: a reply, an annotation the
 * page canvas paints, or (for now) any type the overlay still draws itself.
 */
export function describeAnnotation(
  _a: Annotation,
  _context: DrawContext
): Drawing | undefined {
  return undefined
}
