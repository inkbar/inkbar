/* Accept or dismiss a suggested redaction. Locked suggestions cannot be dismissed. */
import { acceptSuggestion, confidenceBucket, type AnnotationStore } from '@inkbar/core'

import { button, h } from './dom'
import { createPopover } from './popover'

export function createSuggestionCard(root: HTMLElement, store: AnnotationStore) {
  let current: string | null = null
  const popover = createPopover(
    root,
    {
      class: 'ink-suggestion-card',
      'data-ink-suggestion-card': '',
      'aria-label': 'Suggested redaction',
    },
    close
  )

  function open(id: string): void {
    const a = store.get(id)
    if (a?.type !== 'redact' || a.origin !== 'suggested') {
      close()
      return
    }
    current = id
    if (!popover.show(id)) {
      current = null
      return
    }
    const { suggestion } = a
    const bucket = suggestion ? confidenceBucket(suggestion.confidence) : undefined
    popover.panel.replaceChildren(
      h(
        'p',
        { class: 'ink-suggestion-reason' },
        h('strong', {}, suggestion?.reason ?? 'Suggested redaction'),
        ...(bucket
          ? [
              h(
                'span',
                { class: 'ink-suggestion-confidence', 'data-confidence': bucket },
                `${bucket} confidence`
              ),
            ]
          : [])
      ),
      ...(suggestion?.explanation
        ? [h('p', { class: 'ink-suggestion-explanation' }, suggestion.explanation)]
        : []),
      h(
        'div',
        { class: 'ink-suggestion-actions' },
        button('Accept', () => {
          acceptSuggestion(store, id)
          close()
        }),
        ...(a.locked
          ? []
          : [
              button('Dismiss', () => {
                store.remove(id)
                close()
              }),
            ])
      )
    )
    popover.panel.querySelector('button')?.focus()
  }

  function close(): void {
    if (!current) return
    current = null
    popover.hide()
  }

  return { open, destroy: () => popover.destroy() }
}
