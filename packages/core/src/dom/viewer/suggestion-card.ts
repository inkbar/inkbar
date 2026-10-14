/*
 * Review card for a suggested redaction: opens when the activated annotation, or the only
 * selected one (a marquee selects without activating), is a redaction with
 * `origin: 'suggested'`. It closes when that stops being true: accepted, dismissed, or removed
 * some other way (an undo). Locked suggestions cannot be dismissed, so they get no Dismiss
 * button. Closing clears the activation and the selection.
 */
import { acceptSuggestion } from '../../model/annotations/suggestions'
import { confidenceBucket } from '../../model/annotations/types'

import { button, h } from './dom'
import { createPopover } from './popover'

import type { AnnotationStore } from '../../model/annotations/store'
import type { RedactAnnotation } from '../../model/annotations/types'
import type { Writable } from '../../model/readable'
import type { FocusReturn } from '../popover-focus'

export interface SuggestionCardOptions {
  root: HTMLElement
  store: AnnotationStore
  activated: Writable<string | null>
  focusReturn: FocusReturn
}

export function createSuggestionCard(opts: SuggestionCardOptions): { destroy(): void } {
  const { root, store, activated, focusReturn } = opts
  const popover = createPopover({
    root,
    attrs: {
      class: 'ink-suggestion-card',
      'data-ink-suggestion-card': '',
      'aria-label': 'Suggested redaction',
    },
    focusReturn,
    onDismiss: close,
  })
  /** The suggestion as last rendered. */
  let shown: RedactAnnotation | null = null

  function suggestion(id: string | null | undefined): RedactAnnotation | null {
    const a = id ? store.get(id) : undefined
    return a?.type === 'redact' && a.origin === 'suggested' ? a : null
  }

  function target(): RedactAnnotation | null {
    const selection = store.selection.get()
    return (
      suggestion(activated.get()) ??
      (selection.length === 1 ? suggestion(selection[0]) : null)
    )
  }

  function update(): void {
    const t = target()
    if (t === shown) return
    const previous = shown
    shown = t
    if (!t) {
      popover.hide()
      return
    }
    const hadFocus = popover.panel.contains(document.activeElement)
    const opening = previous === null || previous.id !== t.id
    render(t)
    popover.show(t.id)
    if ((opening || hadFocus) && !popover.panel.hidden)
      popover.panel.querySelector('button')?.focus()
  }

  function render(a: RedactAnnotation): void {
    const { suggestion: s } = a
    const bucket = s ? confidenceBucket(s.confidence) : undefined
    popover.panel.replaceChildren(
      h(
        'p',
        { class: 'ink-suggestion-reason' },
        h('strong', {}, s?.reason ?? 'Suggested redaction'),
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
      ...(s?.explanation
        ? [h('p', { class: 'ink-suggestion-explanation' }, s.explanation)]
        : []),
      h(
        'div',
        { class: 'ink-suggestion-actions' },
        button('Accept', accept),
        ...(a.locked ? [] : [button('Dismiss', dismiss)])
      )
    )
  }

  function close(): void {
    activated.set(null)
    store.select([])
  }

  function accept(): void {
    if (shown) acceptSuggestion(store, shown.id)
    close()
  }

  /** Locked annotations cannot be removed: Dismiss is not offered for them. */
  function dismiss(): void {
    if (!shown || shown.locked) return
    focusReturn.beforeRemove(popover.anchor, '[data-origin="suggested"]')
    store.remove(shown.id)
    close()
  }

  const stops = [
    store.list.subscribe(update),
    store.selection.subscribe(update),
    activated.subscribe(update),
  ]
  update()

  return {
    destroy() {
      for (const stop of stops) stop()
      popover.destroy()
    },
  }
}
