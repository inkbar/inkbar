/* Undo, Redo and Suggest redactions, added to the toolbar that createViewer renders. */
import { isInkError, type InkDocument, type Readable } from '@inkbar/core'

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
  const undo = button('Undo')
  const redo = button('Redo')
  const suggest = button('Suggest redactions')
  const result = document.createElement('span')
  result.className = 'demo-result'
  result.setAttribute('role', 'status')
  const group = document.createElement('div')
  group.className = 'demo-actions'
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', 'Edit')
  group.append(undo, redo, suggest, result)
  toolbar.append(group)

  let stops: (() => void)[] = []
  const bind = (doc: InkDocument | null): void => {
    for (const stop of stops) stop()
    stops = []
    result.textContent = ''
    undo.disabled = redo.disabled = suggest.disabled = !doc
    if (!doc) return
    const watch = (r: Readable<boolean>, b: HTMLButtonElement): void => {
      b.disabled = !r.get()
      stops.push(r.subscribe((can) => (b.disabled = !can)))
    }
    watch(doc.history.canUndo, undo)
    watch(doc.history.canRedo, redo)
    undo.onclick = () => doc.history.undo()
    redo.onclick = () => doc.history.redo()
    suggest.onclick = () => {
      suggest.disabled = true
      void suggestRedactions(doc, doc.annotations.list.get())
        .then((found) => {
          doc.history.batch(() => {
            for (const input of found) doc.annotations.add(input)
          })
          result.textContent = suggestionCount(found.length)
        })
        .catch((e: unknown) => {
          // Opening another file mid-run destroys the document; that is not a failure.
          if (!(isInkError(e) && e.code === 'DocumentDestroyed'))
            result.textContent = 'Could not check this document.'
        })
        .finally(() => {
          suggest.disabled = false
        })
    }
  }
  bind(current.get())
  const stopCurrent = current.subscribe(bind)

  return {
    destroy() {
      stopCurrent()
      for (const stop of stops) stop()
      group.remove()
    },
  }
}
