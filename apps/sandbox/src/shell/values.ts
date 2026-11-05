/*
 * The Values panel, for scenarios with a form: the open document's field values as its Gloss
 * export writes them, following each change.
 */
import { glossFields } from '../shared/form.ts'

import type { InkDocument } from '@inkbar/core'

export interface ValuesPanel {
  /** Follows `doc`'s values, or shows nothing for `null`. */
  show(doc: InkDocument | null): void
}

export function createValuesPanel(el: HTMLElement): ValuesPanel {
  el.innerHTML = `
<p class="panel-note">The form's field values, as Gloss.</p>
<pre class="values" tabindex="0" aria-label="Field values"></pre>`
  const pre = el.querySelector('pre')!
  let unfollow = (): void => undefined
  return {
    show(doc) {
      unfollow()
      unfollow = () => undefined
      pre.textContent = glossFields(doc)
      if (doc)
        unfollow = doc.form.values.subscribe(() => (pre.textContent = glossFields(doc)))
    },
  }
}
