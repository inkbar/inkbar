// Compares two readers' form fields and the file's facts. Each difference is one line naming the
// field, the widget and the key, PDF.js's value first.
import { pairDifferences, valueDifferences, type FileFacts, type FileField } from './data'

/**
 * How the engine's fields (`b`) differ from PDF.js's (`a`): which fields there are and their
 * order, by full name; for each field every key; and its widgets, by id, in their order, each
 * with every key. A `rect` may be `RECT_TOLERANCE` apart; every other value must be equal. Empty
 * when they agree.
 */
export function formDifferences(
  a: readonly FileField[],
  b: readonly FileField[]
): string[] {
  return pairDifferences(a, b, {
    noun: 'field',
    plural: 'fields',
    keyName: 'name',
    keyOf: (f) => f.name,
    showKey: (name) => JSON.stringify(name),
    each: (x, y, at) => {
      const { widgets: wa, ...fa } = x
      const { widgets: wb, ...fb } = y
      return [
        ...valueDifferences(fa, fb, at),
        ...pairDifferences(wa, wb, {
          noun: 'widget',
          plural: 'widgets',
          keyName: 'id',
          keyOf: (w) => w.id,
          showKey: (id) => id,
          each: (v, w, widgetAt) => valueDifferences(v, w, widgetAt),
        }).map((line) => `${at}: ${line}`),
      ]
    },
  })
}

/** How the engine's facts of the file (`b`) differ from PDF.js's (`a`), one line per fact. */
export function factDifferences(a: FileFacts, b: FileFacts): string[] {
  return valueDifferences(a, b)
}
