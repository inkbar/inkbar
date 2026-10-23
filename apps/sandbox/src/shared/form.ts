import { describeAction } from '@inkbar/e2e-shared/form-actions'

import type { FormAction, InkDocument } from '@inkbar/core'

/*
 * The Form panel beside each viewer: the form's latest actions and its values as Gloss.
 * Inkbar never sends, opens, mails or prints anything itself. It hands each request to the
 * host, and this sandbox only lists them.
 */

export interface LoggedAction {
  id: number
  text: string
}

let nextId = 0

/** The log with `a` added: the last ten, newest first. */
export function logAction(log: readonly LoggedAction[], a: FormAction): LoggedAction[] {
  return [{ id: nextId++, text: describeAction(a) }, ...log].slice(0, 10)
}

/** The document's form values as its Gloss export writes them. */
export function glossFields(doc: InkDocument | null): string {
  if (!doc) return ''
  return JSON.stringify(doc.exportAnnotations('json').fields ?? {}, null, 2)
}
