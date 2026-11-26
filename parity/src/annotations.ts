// Compares two readers' annotations of a page and its Tab order. Each difference is one line
// naming the annotation and the key, PDF.js's value first.
import { pairDifferences, valueDifferences, type FileAnnotation } from './data'

/**
 * How the engine's annotations of a page (`b`) differ from PDF.js's (`a`): which there are and
 * their order, by id, and for each every key. A `rect` may be `RECT_TOLERANCE` apart; every
 * other value must be equal. Empty when they agree.
 */
export function annotationDifferences(
  a: readonly FileAnnotation[],
  b: readonly FileAnnotation[]
): string[] {
  return pairDifferences(a, b, {
    noun: 'annotation',
    plural: 'annotations',
    keyName: 'id',
    keyOf: (x) => x.id,
    showKey: (id) => id,
    each: (x, y, at) => valueDifferences(x, y, at),
  })
}

const list = (ids: readonly string[]) => (ids.length === 0 ? 'none' : ids.join(', '))

/** One line when the engine's Tab order of a page (`b`) is not PDF.js's (`a`); empty when it is. */
export function tabOrderDifferences(
  a: readonly string[],
  b: readonly string[]
): string[] {
  return a.length === b.length && a.every((id, i) => id === b[i])
    ? []
    : [`tab order: PDF.js ${list(a)}; engine ${list(b)}`]
}
