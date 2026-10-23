/*
 * The find bar for createViewer: a view of the viewer's search state. Put it in the viewport
 * root (`viewer.element.querySelector('[data-ink-viewport-root]')`); the theme floats it over
 * the top-right of the pages. It is hidden while the search is closed, and while it is in the
 * document it registers with the search controller, which is what lets Ctrl/Cmd+F open it.
 */
import { ChevronDown, ChevronUp, CaseSensitive, X } from '@inkbar/icons'

import { button } from '../viewer/controls'
import { searchControllerOf, onViewerDestroy, type Viewer } from '../viewer/create-viewer'
import { h } from '../viewer/dom'

import { findAnnouncer, findCountText } from './find-text'

import type { SearchState } from './controller'

/**
 * The find bar for `viewer`: a field, the match count, previous and next, a match-case toggle
 * and close. Its buttons keep focus while used; Enter in the field steps to the next match,
 * Shift+Enter to the previous, Escape closes. Closing returns focus to where it was before the
 * bar opened, else to the document.
 */
export function createFindBar(viewer: Viewer): HTMLElement {
  const controller = searchControllerOf(viewer)
  const { state } = controller

  const field = h('input', {
    type: 'text',
    'aria-label': 'Find in document',
    autocomplete: 'off',
    spellcheck: 'false',
  })
  const count = h('span', {
    class: 'ink-find-count',
    'data-ink-find-count': '',
  })
  const previous = button('Previous match', { 'data-ink-find-previous': '' }, ChevronUp)
  const next = button('Next match', { 'data-ink-find-next': '' }, ChevronDown)
  const matchCase = button(
    'Match case',
    { 'data-ink-find-match-case': '', 'aria-pressed': 'false' },
    CaseSensitive
  )
  const close = button('Close find', { 'data-ink-find-close': '' }, X)
  const live = h('div', {
    class: 'ink-visually-hidden',
    'data-ink-find-status': '',
    'aria-live': 'polite',
  })
  const bar = h(
    'div',
    { class: 'ink-find-bar', 'data-ink-find-bar': '', role: 'search', hidden: '' },
    field,
    count,
    previous,
    next,
    matchCase,
    close,
    live
  )

  field.addEventListener('input', () => controller.setQuery(field.value))
  previous.addEventListener('click', () => controller.previous())
  next.addEventListener('click', () => controller.next())
  matchCase.addEventListener('click', () =>
    controller.setMatchCase(!state.get().matchCase)
  )
  close.addEventListener('click', () => controller.close())
  field.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return
    e.preventDefault()
    if (e.shiftKey) controller.previous()
    else controller.next()
  })
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
    e.preventDefault()
    e.stopPropagation()
    controller.close()
  })

  /** Where focus was when the bar opened. */
  let before: HTMLElement | null = null
  let wasOpen = false
  const announce = findAnnouncer()
  let announced = ''

  function restoreFocus(): void {
    const target =
      before?.isConnected && !bar.contains(before)
        ? before
        : viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')
    before = null
    target?.focus({ preventScroll: true })
  }

  function show(s: SearchState): void {
    if (s.open !== wasOpen) {
      wasOpen = s.open
      if (s.open) {
        const active = bar.ownerDocument.activeElement
        before =
          active instanceof HTMLElement &&
          active !== bar.ownerDocument.body &&
          !bar.contains(active)
            ? active
            : null
        bar.hidden = false
        field.focus()
        field.select()
      } else {
        // Focus inside the bar is about to be lost with it; focus elsewhere is left alone.
        const active = bar.ownerDocument.activeElement
        const hadFocus = bar.contains(active) || active === bar.ownerDocument.body
        bar.hidden = true
        if (hadFocus) restoreFocus()
        else before = null
      }
    }
    if (field.value !== s.query) {
      field.value = s.query
      // A query set from code arrives after the bar opened: keep the new text selected.
      if (bar.ownerDocument.activeElement === field) field.select()
    }
    count.textContent = findCountText(s)
    matchCase.setAttribute('aria-pressed', String(s.matchCase))
    const say = announce(s)
    if (say !== announced) {
      announced = say
      live.textContent = say
    }
  }

  // Registered while inside the viewer's root, where Ctrl/Cmd+F looks for the field. The
  // observer sees the bar added and removed wherever the host puts it in there.
  let detach: (() => void) | null = null
  const sync = (): void => {
    const inside = viewer.element.contains(bar)
    if (inside && !detach) detach = controller.attachBar()
    else if (!inside && detach) {
      detach()
      detach = null
    }
  }
  const observer = new MutationObserver(sync)
  observer.observe(viewer.element, { childList: true, subtree: true })
  const stopState = state.subscribe(show)
  show(state.get())
  sync()
  onViewerDestroy(viewer, () => {
    observer.disconnect()
    stopState()
    detach?.()
    detach = null
  })
  return bar
}
