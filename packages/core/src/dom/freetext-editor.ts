// In-place editing for a free-text box. The editor is a plain-text `contenteditable` laid over
// the box inside its overlay element, styled from the annotation exactly as the box is
// (`styleFreeText`), with the box itself hidden underneath. It grows downwards on screen as the
// text needs more lines, and nothing reaches the store until it closes: a commit hands back the
// text and the grown rect together, so the edit is one change and one undo step.
//
// Inline styles here are structural or geometric only: the editor's position and minimum
// height, the box's `visibility` while it is covered, and the element's grown height.
import { styleFreeText } from './overlay-render'

import type { PageTransform } from './transform'
import type { AnnotationStore } from '../model/annotations/store'
import type { FreeTextAnnotation } from '../model/annotations/types'
import type { Rect } from '../model/geometry'

export interface FreeTextEditor {
  /** Closes the editor, handing its text to `commit` (true) or calling `cancel` (false). */
  close(commit: boolean): void
}

export interface FreeTextEditorOptions {
  transform: PageTransform
  /** The edited text and the box's rect, grown to fit it, in user space. */
  commit(contents: string, rect: Rect): void
  cancel(): void
}

/** The open editor on each overlay element. */
const editors = new WeakMap<HTMLElement, FreeTextEditor>()
/** Presses that closed an editor, so a tool can leave them alone. */
const closingPresses = new WeakSet<Event>()

/** The editor open on an overlay element, if any. */
export function editorFor(el: HTMLElement): FreeTextEditor | undefined {
  return editors.get(el)
}

/** True when `e` is a press outside an editor that closed it. */
export function closedEditor(e: Event): boolean {
  return closingPresses.has(e)
}

/** Point within which a grown height counts as unchanged, CSS px. */
const SAME_PX = 0.5

/**
 * Opens an editor on `el`, the overlay element showing `a` (or a stand-in for a box not in the
 * store yet). `Escape` commits; a press outside the editor, or focus leaving it, commits too.
 * Closing while the editor has focus hands focus to `el`. Keys typed in the
 * editor stop there, so no viewport or tool shortcut sees them. Opening a second editor on the
 * same element commits the first.
 */
export function editFreeText(
  el: HTMLElement,
  a: FreeTextAnnotation,
  opts: FreeTextEditorOptions
): FreeTextEditor {
  editors.get(el)?.close(true)
  const doc = el.ownerDocument
  const view = doc.defaultView
  const base = opts.transform.toCssRect(a.rect)
  const box = el.querySelector<HTMLElement>(':scope > .ink-free-text')

  const field = doc.createElement('div')
  field.className = 'ink-free-text'
  field.dataset.inkEditor = ''
  field.setAttribute('role', 'textbox')
  field.setAttribute('aria-multiline', 'true')
  field.setAttribute('aria-label', 'Text box')
  styleFreeText(field, a, opts.transform)
  field.style.position = 'absolute'
  field.style.left = '0'
  field.style.top = '0'
  field.style.width = '100%'
  field.style.height = 'auto'
  field.style.minHeight = `${base.height}px`
  field.style.pointerEvents = 'auto'
  makeEditable(field)
  field.textContent = a.contents
  if (box) box.style.visibility = 'hidden'
  el.append(field)

  /** The box's CSS height for the text now in it: never less than it started at. */
  const height = (): number => Math.max(base.height, field.getBoundingClientRect().height)
  const grow = (): void => {
    el.style.height = `${height()}px`
  }
  const Observer = view?.ResizeObserver
  const observer = Observer ? new Observer(grow) : undefined
  observer?.observe(field)

  const read = (): string => {
    const text = field.innerText.replace(/\r\n?/g, '\n')
    // A trailing line break is held open by a placeholder <br>, which reads as one more.
    return field.lastChild?.nodeName === 'BR' ? text.replace(/\n$/, '') : text
  }
  const rect = (): Rect => {
    const h = height()
    if (Math.abs(h - base.height) < SAME_PX) return a.rect
    return opts.transform.fromCssRect({ ...base, height: h })
  }

  let closed = false
  const finish = (commit: boolean): void => {
    if (closed) return
    closed = true
    const contents = read()
    const next = rect()
    observer?.disconnect()
    view?.removeEventListener('pointerdown', onOutside, true)
    editors.delete(el)
    // While the editor has focus, it moves to the box before the editor goes, so it never
    // falls back to <body>. Focus that already left (a click on a control) stays where it is.
    if (field.contains(doc.activeElement)) el.focus({ preventScroll: true })
    field.remove()
    box?.style.removeProperty('visibility')
    el.style.height = `${base.height}px`
    if (commit) opts.commit(contents, next)
    else opts.cancel()
  }

  const onOutside = (e: Event): void => {
    if (e.target instanceof Node && field.contains(e.target)) return
    closingPresses.add(e)
    finish(true)
  }
  view?.addEventListener('pointerdown', onOutside, true)
  field.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape' && !e.isComposing) {
      e.preventDefault()
      finish(true)
    }
  })
  field.addEventListener('focusout', (e) => {
    // A window losing focus (another tab, devtools) leaves the edit open.
    if (!doc.hasFocus()) return
    const to = e.relatedTarget
    if (to instanceof Node && field.contains(to)) return
    finish(true)
  })
  // Plain text only, whatever the clipboard holds and whichever editing mode the browser has.
  field.addEventListener('paste', (e) => {
    e.preventDefault()
    insertText(field, e.clipboardData?.getData('text/plain') ?? '')
  })
  field.addEventListener('beforeinput', (e) => {
    if (e.inputType.startsWith('format')) e.preventDefault()
  })

  field.focus({ preventScroll: true })
  const selection = doc.getSelection()
  if (selection) {
    const range = doc.createRange()
    range.selectNodeContents(field)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  grow()

  const editor: FreeTextEditor = { close: (commit) => finish(commit) }
  editors.set(el, editor)
  return editor
}

/**
 * Opens an editor on the overlay element `el` for the free-text box `id`, wired to the store: a
 * commit is one `update` with the text and the grown rect (none when neither changed), and an
 * empty box is removed, as an abandoned note is. Returns undefined when the box cannot be
 * edited: missing, locked, or not free text.
 */
export function editFreeTextIn(
  store: AnnotationStore,
  el: HTMLElement,
  id: string,
  transform: PageTransform
): FreeTextEditor | undefined {
  const a = store._getProposed(id) ?? store.get(id)
  if (!a || a.type !== 'freetext' || a.locked) return undefined
  const current = (): FreeTextAnnotation | undefined => {
    const now = store._getProposed(id) ?? store.get(id)
    return now?.type === 'freetext' ? now : undefined
  }
  return editFreeText(el, a, {
    transform,
    commit(contents, rect) {
      const now = current()
      if (!now) return
      if (contents.trim() === '') {
        store.remove(id)
        return
      }
      if (contents === now.contents && sameRect(rect, now.rect)) return
      store.update(id, { contents, rect })
    },
    cancel() {
      const now = current()
      if (now && now.contents.trim() === '') store.remove(id)
    },
  })
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/** `plaintext-only` where the browser has it, else `true` (paste and formatting are then guarded). */
function makeEditable(field: HTMLElement): void {
  try {
    field.contentEditable = 'plaintext-only'
  } catch {
    // Older engines throw on the value.
  }
  if (field.contentEditable !== 'plaintext-only') field.contentEditable = 'true'
}

/** Inserts `text` at the caret, replacing any selected text, and leaves the caret after it. */
function insertText(field: HTMLElement, text: string): void {
  const doc = field.ownerDocument
  const selection = doc.getSelection()
  const node = doc.createTextNode(text)
  if (!selection || selection.rangeCount === 0) {
    field.append(node)
    return
  }
  const range = selection.getRangeAt(0)
  if (!field.contains(range.commonAncestorContainer)) {
    field.append(node)
    return
  }
  range.deleteContents()
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}
