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

import type { SearchController, SearchState } from './controller'

/** Longest page selection that becomes the query. */
const MAX_SELECTION = 200

const FIELD = '[data-ink-find-bar] input'

/** The count beside the field: "3 of 17", "3 of 12…" while scanning, "No results". */
function countText(s: SearchState): string {
  if (s.query === '') return ''
  if (s.hits.length === 0) return s.scanning ? '' : 'No results'
  return `${s.current + 1} of ${s.hits.length}${s.scanning ? '…' : ''}`
}

/** The announcement for a settled scan, or '' while there is nothing to say. */
function announcement(s: SearchState): string {
  if (!s.open || s.scanning || s.query === '') return ''
  const hit = s.hits[s.current]
  if (!hit) return 'No results'
  return `Match ${s.current + 1} of ${s.hits.length}, page ${hit.page + 1}`
}

/**
 * The text selected on the page inside `root`, on one line and trimmed; '' when there is none,
 * when it is not in `root`, when it is in the find bar, or when it is too long to be a query.
 */
export function pageSelectionText(root: HTMLElement): string {
  const sel = root.ownerDocument.defaultView?.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return ''
  const { anchorNode, focusNode } = sel
  if (
    !anchorNode ||
    !focusNode ||
    !root.contains(anchorNode) ||
    !root.contains(focusNode)
  )
    return ''
  const bar = (node: Node): boolean =>
    (node instanceof Element ? node : node.parentElement)?.closest(
      '[data-ink-find-bar]'
    ) != null
  if (bar(anchorNode) || bar(focusNode)) return ''
  const text = sel.toString().replace(/\s+/g, ' ').trim()
  return text.length > MAX_SELECTION ? '' : text
}

/**
 * Ctrl/Cmd+F on a viewer's root. Takes the key only when a find bar is mounted for this
 * viewer and the event comes from inside its root (listen on the root, or pass an event that
 * bubbled to it); otherwise the browser keeps it. Opens the search with the page selection as
 * the query, if there is one, and focuses and selects the field. Returns whether it took the key.
 *
 * @internal Shared with the framework bindings.
 */
export function handleFindKey(
  e: KeyboardEvent,
  controller: SearchController,
  selection: () => string
): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'f')
    return false
  if (!controller.barAttached.get()) return false
  const target = e.target instanceof Node ? e.target : null
  const root =
    e.currentTarget instanceof HTMLElement
      ? e.currentTarget
      : (target instanceof Element
          ? target
          : target?.parentElement
        )?.closest<HTMLElement>('[data-ink-root]')
  if (!root || !target || !root.contains(target)) return false
  e.preventDefault()
  const text = selection()
  controller.open(text === '' ? undefined : text)
  const field = root.querySelector<HTMLInputElement>(FIELD)
  field?.focus()
  field?.select()
  return true
}

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
    if (e.key !== 'Escape' || e.defaultPrevented) return
    e.preventDefault()
    e.stopPropagation()
    controller.close()
  })

  /** Where focus was when the bar opened. */
  let before: HTMLElement | null = null
  let wasOpen = false
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
    if (field.value !== s.query) field.value = s.query
    count.textContent = countText(s)
    matchCase.setAttribute('aria-pressed', String(s.matchCase))
    const say = announcement(s)
    if (say !== announced) {
      announced = say
      live.textContent = say
    }
  }

  // Registered while in the document. The observer sees the bar added and removed wherever
  // the host puts it inside the viewer's root.
  let detach: (() => void) | null = null
  const sync = (): void => {
    if (bar.isConnected && !detach) detach = controller.attachBar()
    else if (!bar.isConnected && detach) {
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
