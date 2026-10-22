/*
 * Draws a page's open suggestions into the plugin's layer: one button per suggestion, over its
 * text, with a dashed border in its confidence colour. The layer comes after the page's
 * annotations, so Tab reaches the marks after them. A press on a mark is the plugin's: it opens
 * the review card and goes no further, so it neither clears the selection nor starts a tool.
 */
import type { Suggestion } from './suggestions.ts'
import type { PageTransform } from '@inkbar/core/dom'

export function confidenceLevel(confidence: number): 'low' | 'medium' | 'high' {
  return confidence < 0.5 ? 'low' : confidence < 0.8 ? 'medium' : 'high'
}

const COLORS = { low: '#D4A017', medium: '#E67E22', high: '#C0392B' }

/** The colour a suggestion is drawn in. */
export function confidenceColor(confidence: number): string {
  return COLORS[confidenceLevel(confidence)]
}

function createMark(
  s: Suggestion,
  onOpen: (id: string, mark: HTMLElement) => void
): HTMLButtonElement {
  const mark = document.createElement('button')
  mark.type = 'button'
  mark.className = 'sandbox-suggestion'
  mark.dataset.suggestion = s.id
  mark.setAttribute('aria-label', `Suggested redaction: ${s.reason}`)
  mark.style.borderColor = confidenceColor(s.confidence)
  mark.addEventListener('pointerdown', (e) => e.stopPropagation())
  // A button's click comes from Enter and Space too.
  mark.addEventListener('click', (e) => {
    e.stopPropagation()
    onOpen(s.id, mark)
  })
  return mark
}

/**
 * Makes `el`'s marks match `list`, in its order, placed through `transform`: the only
 * conversion from PDF user space to CSS pixels the plugin needs. Marks that stay are moved,
 * not redrawn, so a focused mark keeps focus (and the card stays anchored to it) through a
 * zoom or another suggestion's change.
 */
export function drawSuggestions(
  el: HTMLElement,
  list: readonly Suggestion[],
  transform: PageTransform,
  onOpen: (id: string, mark: HTMLElement) => void
): void {
  const kept = new Map<string, HTMLElement>()
  for (const mark of [...el.children] as HTMLElement[]) {
    const id = mark.dataset.suggestion
    if (id && list.some((s) => s.id === id)) kept.set(id, mark)
    else mark.remove()
  }
  let next = el.firstElementChild
  for (const s of list) {
    const mark = kept.get(s.id) ?? createMark(s, onOpen)
    const r = transform.toCssRect(s.rect)
    mark.style.left = `${r.left}px`
    mark.style.top = `${r.top}px`
    mark.style.width = `${r.width}px`
    mark.style.height = `${r.height}px`
    if (mark === next) next = mark.nextElementSibling
    else el.insertBefore(mark, next)
  }
}
