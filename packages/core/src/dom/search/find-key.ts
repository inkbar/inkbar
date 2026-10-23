/*
 * Ctrl/Cmd+F for a viewer's root, and the page selection it takes as the query. Shared by
 * createViewer and the framework bindings.
 */
import type { SearchController } from './controller'

/** Longest page selection that becomes the query. */
const MAX_SELECTION = 200

const FIELD = '[data-ink-find-bar] input'

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
 * F by its letter, or by its place on a layout without Latin letters (Cyrillic, Greek), where
 * `key` is that layout's letter. A Latin layout with another letter there keeps that letter.
 */
function isFindKey(e: KeyboardEvent): boolean {
  if (e.key.toLowerCase() === 'f') return true
  return e.code === 'KeyF' && !/^[a-z]$/i.test(e.key)
}

/**
 * Ctrl/Cmd+F on a viewer's root. Call it from a `keydown` listener on that root (it reads
 * `currentTarget`). Takes the key only when a find bar is mounted for this viewer and the event
 * comes from inside the root; otherwise the browser keeps it. Opens the search with the page selection as
 * the query, if there is one, and focuses and selects the field. Returns whether it took the key.
 *
 * @internal Shared with the framework bindings.
 */
export function handleFindKey(
  e: KeyboardEvent,
  controller: SearchController,
  selection: () => string
): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || !isFindKey(e)) return false
  if (!controller.barAttached.get()) return false
  const root = e.currentTarget
  if (!(root instanceof HTMLElement)) return false
  if (!(e.target instanceof Node) || !root.contains(e.target)) return false
  e.preventDefault()
  const text = selection()
  controller.open(text === '' ? undefined : text)
  const field = root.querySelector<HTMLInputElement>(FIELD)
  field?.focus()
  field?.select()
  return true
}
