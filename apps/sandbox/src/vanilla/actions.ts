/* Suggest redactions: a custom control, added to the demo's toolbar. */
import { isInkError, type InkDocument, type Readable } from '@inkbar/core'

import { exposeDocument } from '../shared/e2e-hook'
import { suggestionCount, suggestRedactions } from '../shared/suggest'

function button(label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  return b
}

export function addActions(
  toolbar: HTMLElement,
  current: Readable<InkDocument | null>
): { destroy(): void } {
  const suggest = button('Suggest redactions')
  const result = document.createElement('span')
  result.className = 'demo-result'
  result.setAttribute('role', 'status')
  const group = document.createElement('div')
  group.className = 'demo-actions'
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', 'Suggest')
  group.append(suggest, result)
  toolbar.append(group)

  const bind = (doc: InkDocument | null): void => {
    exposeDocument(doc)
    result.textContent = ''
    suggest.disabled = !doc
    if (!doc) {
      suggest.onclick = null
      return
    }
    suggest.onclick = () => {
      suggest.disabled = true
      void suggestRedactions(doc, doc.annotations.list.get())
        .then((found) => {
          doc.history.batch(() => {
            for (const input of found) doc.annotations.add(input)
          })
          if (current.get() === doc) result.textContent = suggestionCount(found.length)
        })
        .catch((e: unknown) => {
          // Opening another file mid-run destroys the document; that is not a failure.
          if (current.get() !== doc) return
          if (!(isInkError(e) && e.code === 'DocumentDestroyed'))
            result.textContent = 'Could not check this document.'
        })
        .finally(() => {
          if (current.get() === doc) suggest.disabled = false
        })
    }
  }
  bind(current.get())
  const stopCurrent = current.subscribe(bind)

  return {
    destroy() {
      stopCurrent()
      group.remove()
    },
  }
}
