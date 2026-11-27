/*
 * The Values panel, for scenarios with a form: the open document's field values as its Gloss
 * export writes them, following each change.
 */
import { glossFields } from '../shared/form.ts'

import type { ShellText } from '../shared/strings/types.ts'
import type { InkDocument } from '@inkbar/core'

export interface ValuesPanel {
  /** Follows `doc`'s values, or shows nothing for `null`. */
  show(doc: InkDocument | null): void
  /** Shows the panel's own words in another language. */
  setText(text: ShellText): void
}

export function createValuesPanel(el: HTMLElement, text: ShellText): ValuesPanel {
  el.innerHTML = `
<p class="panel-note"></p>
<pre class="values" tabindex="0"></pre>`
  const note = el.querySelector('p')!
  const pre = el.querySelector('pre')!
  const setText = (next: ShellText): void => {
    note.textContent = next.valuesNote
    pre.setAttribute('aria-label', next.fieldValues)
  }
  setText(text)
  let unfollow = (): void => undefined
  return {
    setText,
    show(doc) {
      unfollow()
      unfollow = () => undefined
      pre.textContent = glossFields(doc)
      if (doc)
        unfollow = doc.form.values.subscribe(() => (pre.textContent = glossFields(doc)))
    },
  }
}
