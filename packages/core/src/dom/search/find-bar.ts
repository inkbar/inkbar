/*
 * The find bar for createViewer: a view of the viewer's search state. Put it in the viewport
 * root (`viewer.element.querySelector('[data-ink-viewport-root]')`); the theme floats it over
 * the top-right of the pages. It is hidden while the search is closed, and while it is in the
 * document it registers with the search controller, which is what lets Ctrl/Cmd+F open it.
 */
import { ChevronDown, ChevronUp, CaseSensitive, Search, X } from '@inkbar/icons'

import { button, createIcon, nameButton } from '../viewer/controls'
import {
  messagesOf,
  searchControllerOf,
  onViewerDestroy,
  type Viewer,
} from '../viewer/create-viewer'
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
  const messages = messagesOf(viewer)
  const t = messages.get().messages.find

  const field = h('input', {
    type: 'text',
    'aria-label': t.field,
    autocomplete: 'off',
    spellcheck: 'false',
  })
  const count = h('span', {
    class: 'ink-find-count',
    'data-ink-find-count': '',
  })
  const previous = button(t.previous, { 'data-ink-find-previous': '' }, ChevronUp)
  const next = button(t.next, { 'data-ink-find-next': '' }, ChevronDown)
  const matchCase = button(
    t.matchCase,
    { 'data-ink-find-match-case': '', 'aria-pressed': 'false' },
    CaseSensitive
  )
  const close = button(t.close, { 'data-ink-find-close': '' }, X)
  const live = h('div', {
    class: 'ink-visually-hidden',
    'data-ink-find-status': '',
    'aria-live': 'polite',
  })
  const bar = h(
    'div',
    { class: 'ink-find-bar', 'data-ink-find-bar': '', role: 'search', hidden: '' },
    h(
      'div',
      { class: 'ink-input-group' },
      h('span', { class: 'ink-input-accessory' }, createIcon(Search)),
      field
    ),
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
  // Remade with each new set of words, so the next announcement is in them.
  let announce = findAnnouncer(messages.get().messages)
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
    count.textContent = findCountText(s, messages.get().messages)
    matchCase.setAttribute('aria-pressed', String(s.matchCase))
    const say = announce(s)
    // The same words again are said only when the region holds others: what it said before a
    // change of language, which the change itself left in place.
    if (say !== announced || live.textContent !== say) {
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
  // New words: names and the count change in place; the query, focus and open state stay. What
  // the live region last said stays until the next announcement, which is in the new words.
  const stopMessages = messages.subscribe(({ messages: m }) => {
    field.setAttribute('aria-label', m.find.field)
    nameButton(previous, m.find.previous)
    nameButton(next, m.find.next)
    nameButton(matchCase, m.find.matchCase)
    nameButton(close, m.find.close)
    count.textContent = findCountText(state.get(), m)
    announce = findAnnouncer(m)
    // The fresh announcer has seen nothing: it catches up without speaking, so only the next
    // change is announced, in the new words.
    announced = announce(state.get())
  })
  sync()
  onViewerDestroy(viewer, () => {
    observer.disconnect()
    stopState()
    stopMessages()
    detach?.()
    detach = null
  })
  return bar
}
