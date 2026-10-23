/** A flag as a plain value, or as a readable such as core's `History.canUndo`. */
type Flag = boolean | { get(): boolean }

/**
 * What the keys drive: core's `History`, or a framework binding's history, whose flags are
 * plain values.
 */
export interface HistoryKeysTarget {
  readonly canUndo: Flag
  readonly canRedo: Flag
  undo(): void
  redo(): void
}

/** Keys typed here keep the element's own undo (a text field's typing). */
const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])'

const on = (f: Flag): boolean => (typeof f === 'boolean' ? f : f.get())

/** `'undo'`, `'redo'` or nothing for a keydown. */
function historyAction(e: KeyboardEvent): 'undo' | 'redo' | undefined {
  if (e.altKey || !(e.ctrlKey || e.metaKey)) return undefined
  const k = e.key.toLowerCase()
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (k === 'y' && e.ctrlKey && !e.metaKey && !e.shiftKey) return 'redo'
  return undefined
}

/**
 * Undo and redo from the keyboard: Ctrl or Cmd+Z undoes, Ctrl or Cmd+Shift+Z and Ctrl+Y redo,
 * for keys pressed anywhere inside `el`. They do what the Undo and Redo buttons do: `history`
 * is read on every key, and a key acts only while its button would be enabled (`canUndo`,
 * `canRedo`). Then it is prevented; otherwise it is left to the browser. Events from inputs,
 * text areas, selects and editable content are left alone, so a field keeps its native text
 * undo, as are events already handled. Returns a function that removes the listener.
 */
export function attachHistoryKeys(
  el: HTMLElement,
  history: () => HistoryKeysTarget | null | undefined
): () => void {
  const onKeydown = (e: KeyboardEvent): void => {
    // A held chord repeats, stepping through the history as native apps do. Each repeat reads
    // the flags again, so the last step stops it.
    if (e.defaultPrevented || e.isComposing) return
    const action = historyAction(e)
    if (!action) return
    if (e.target instanceof Element && e.target.closest(EDITABLE)) return
    const h = history()
    if (!h || !on(action === 'undo' ? h.canUndo : h.canRedo)) return
    e.preventDefault()
    h[action]()
  }
  el.addEventListener('keydown', onKeydown)
  return () => el.removeEventListener('keydown', onKeydown)
}

/**
 * Keeps focus in the viewer when a focused Undo or Redo button inside `el` turns disabled
 * (it undid or redid the last step), which would otherwise drop focus to `<body>`, out of
 * reach of the undo and redo keys. Focus moves to `scroll()`, the viewer's scroll element,
 * without scrolling. Returns a function that removes the listener.
 */
export function keepHistoryFocus(
  el: HTMLElement,
  scroll: () => HTMLElement | null | undefined
): () => void {
  const onFocusout = (e: FocusEvent): void => {
    const button = e.target
    // A disabled control loses focus with nowhere to go; a move elsewhere names its target.
    if (!(button instanceof HTMLButtonElement) || !button.disabled) return
    if (e.relatedTarget !== null || !button.matches('[data-ink-undo], [data-ink-redo]'))
      return
    const target = scroll()
    if (!target?.isConnected) return
    // A container the host did not make focusable still takes focus from script.
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1
    target.focus({ preventScroll: true })
  }
  el.addEventListener('focusout', onFocusout)
  return () => el.removeEventListener('focusout', onFocusout)
}
