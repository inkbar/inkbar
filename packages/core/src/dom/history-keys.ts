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
