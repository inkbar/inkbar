/*
 * An app extension built only on Inkbar's public API; Inkbar itself knows nothing about
 * suggestions.
 *
 * The review card for a suggested redaction. It opens for the activated annotation, or the
 * only selected one (a marquee selects without activating), when that is a suggestion still
 * to review, and closes once it is not: accepted, dismissed or undone. Closing clears the
 * activation and the selection. A locked mark cannot be removed, so it gets no Dismiss.
 */
import { createFocusReturn, createPopover } from '@inkbar/core/dom'

import {
  acceptSuggestion,
  confidenceColor,
  confidenceLevel,
  suggestionOf,
} from './suggestion'

import type { Annotation, AnnotationStore, Readable } from '@inkbar/core'

export interface SuggestionCardHost {
  /** The viewer root (`[data-ink-root]`). */
  root: HTMLElement
  store: AnnotationStore
  activated: Readable<string | null>
  setActivated(id: string | null): void
}

function el(tag: string, className: string, ...children: (Node | string)[]): HTMLElement {
  const e = document.createElement(tag)
  e.className = className
  e.append(...children)
  return e
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.addEventListener('click', onClick)
  return b
}

const LEVEL_LABELS = { low: 'Low', medium: 'Medium', high: 'High' }

export function mountSuggestionCard(host: SuggestionCardHost): { destroy(): void } {
  const { store } = host
  const focusReturn = createFocusReturn({
    root: () => host.root,
    activated: () => host.activated.get(),
  })
  const popover = createPopover({
    root: host.root,
    attrs: { class: 'sandbox-suggestion-card', 'aria-label': 'Suggested redaction' },
    focusReturn,
    onDismiss: close,
  })
  /** The suggestion as last rendered. */
  let shown: Annotation | null = null

  function reviewable(id: string | null | undefined): Annotation | null {
    const a = id ? store.get(id) : undefined
    return a && suggestionOf(a)?.status === 'suggested' ? a : null
  }

  function target(): Annotation | null {
    const selection = store.selection.get()
    return (
      reviewable(host.activated.get()) ??
      (selection.length === 1 ? reviewable(selection[0]) : null)
    )
  }

  function update(): void {
    const t = target()
    if (t === shown) return
    const opening = shown?.id !== t?.id
    shown = t
    if (!t) {
      popover.hide()
      return
    }
    const hadFocus = popover.panel.contains(document.activeElement)
    render(t)
    popover.show(t.id)
    if ((opening || hadFocus) && !popover.panel.hidden)
      popover.panel.querySelector('button')?.focus()
  }

  function render(a: Annotation): void {
    const s = suggestionOf(a)!
    const swatch = el('span', 'sandbox-suggestion-swatch')
    swatch.style.background = confidenceColor(s.confidence)
    popover.panel.replaceChildren(
      el(
        'p',
        'sandbox-suggestion-reason',
        el('strong', '', s.reason),
        el(
          'span',
          'sandbox-suggestion-confidence',
          swatch,
          `${LEVEL_LABELS[confidenceLevel(s.confidence)]} confidence`
        )
      ),
      ...(s.explanation
        ? [el('p', 'sandbox-suggestion-explanation', s.explanation)]
        : []),
      el(
        'div',
        'sandbox-suggestion-actions',
        button('Accept', accept),
        ...(a.locked ? [] : [button('Dismiss', dismiss)])
      )
    )
  }

  function close(): void {
    host.setActivated(null)
    store.select([])
  }

  function accept(): void {
    if (shown) acceptSuggestion(store, shown.id)
    close()
  }

  function dismiss(): void {
    if (!shown || shown.locked) return
    // Focus moves on to the next suggestion, not back to the mark about to go.
    focusReturn.beforeRemove(popover.anchor, '[data-sandbox-suggestion="suggested"]')
    store.remove(shown.id)
    close()
  }

  const stops = [
    store.list.subscribe(update),
    store.selection.subscribe(update),
    host.activated.subscribe(update),
  ]
  update()

  return {
    destroy() {
      for (const stop of stops) stop()
      popover.destroy()
    },
  }
}
