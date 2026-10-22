/*
 * The review card for a suggestion: its reason, confidence and explanation, with Accept and
 * Dismiss. It is a core popover anchored to the mark that opened it, so it follows the mark
 * as the page scrolls and zooms, and hides if the mark goes. Escape or a press outside closes
 * it and focus goes back to the mark; after Accept or Dismiss the mark is gone, so focus moves
 * on to the next one.
 */
import { createFocusReturn, createPopover, type Popover } from '@inkbar/core/dom'

import { confidenceColor, confidenceLevel } from './layer.ts'

import type { Suggestion } from './suggestions.ts'

export interface SuggestionCardOptions {
  /** The suggestion as it stands now. */
  get(id: string): Suggestion | undefined
  onAccept(id: string): void
  onDismiss(id: string): void
}

export interface SuggestionCard {
  /** Shows suggestion `id` next to `mark`, focusing Accept. */
  open(id: string, mark: HTMLElement): void
  destroy(): void
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

/** The mark after `mark` in the viewer, else the one before it. */
function neighbour(root: HTMLElement, mark: HTMLElement | null): HTMLElement | undefined {
  const marks = [...root.querySelectorAll<HTMLElement>('.sandbox-suggestion')]
  const i = mark ? marks.indexOf(mark) : -1
  return i < 0 ? undefined : (marks[i + 1] ?? marks[i - 1])
}

export function createSuggestionCard(opts: SuggestionCardOptions): SuggestionCard {
  /** Made on first open, in the viewer the first mark is in. */
  let popover: Popover | null = null
  let root: HTMLElement | null = null
  /** The suggestion on show. */
  let shown: string | null = null

  function close(): void {
    shown = null
    popover?.hide()
  }

  /** Accept or Dismiss: the mark goes, so focus moves to the next one before the card hides. */
  function act(fn: (id: string) => void): void {
    if (!shown || !popover || !root) return
    const next = neighbour(root, popover.anchor)
    fn(shown)
    next?.focus({ preventScroll: true })
    close()
  }

  function render(s: Suggestion): void {
    const swatch = el('span', 'sandbox-suggestion-swatch')
    swatch.style.background = confidenceColor(s.confidence)
    popover!.panel.replaceChildren(
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
        button('Accept', () => act((id) => opts.onAccept(id))),
        button('Dismiss', () => act((id) => opts.onDismiss(id)))
      )
    )
  }

  return {
    open(id, mark) {
      const s = opts.get(id)
      const viewer = mark.closest<HTMLElement>('[data-ink-root]')
      if (!s || !viewer) return
      if (viewer !== root) {
        popover?.destroy()
        root = viewer
        const focusReturn = createFocusReturn({
          root: () => viewer,
          activated: () => null,
        })
        popover = createPopover({
          root: viewer,
          attrs: {
            class: 'sandbox-suggestion-card',
            'aria-label': 'Suggested redaction',
          },
          focusReturn,
          onDismiss: close,
        })
      }
      shown = id
      render(s)
      popover!.showAt(mark)
      popover!.panel.querySelector('button')?.focus()
    },
    destroy() {
      popover?.destroy()
      popover = null
      root = null
    },
  }
}
