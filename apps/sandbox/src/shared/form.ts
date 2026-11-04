import type { FieldValues, InkDocument } from '@inkbar/core'

/*
 * Helpers for the Values tab and the Events log. Inkbar never sends, opens, mails or prints
 * anything itself: it hands each form request to the host, and this sandbox only lists them.
 */

/** The document's form values as its Gloss export writes them. */
export function glossFields(doc: InkDocument | null): string {
  if (!doc) return ''
  return JSON.stringify(doc.exportAnnotations('json').fields ?? {}, null, 2)
}

/** The names of the fields whose value differs between `before` and `after`, sorted. */
export function changedFields(before: FieldValues, after: FieldValues): string[] {
  const names = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...names]
    .filter((name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]))
    .sort()
}
