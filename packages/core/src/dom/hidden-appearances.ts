import type { InkDocument } from '../model/document'

/**
 * What a render of the page leaves out: the annotations `ids` names (form widgets the form
 * layer draws) plus the file annotations lifted into the session, which the overlay draws
 * instead.
 *
 * @internal
 */
export function hiddenAppearances(
  doc: InkDocument,
  ids: Iterable<string> = []
): ReadonlySet<string> {
  return new Set([...ids, ...doc._lifted.get()])
}
