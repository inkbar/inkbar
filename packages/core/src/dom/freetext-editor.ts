// In-place editing for a free-text box. The editor is a plain-text `contenteditable` laid over
// the box inside its overlay element, styled from the annotation exactly as the box is
// (`styleFreeText`), with the box itself hidden underneath. It grows downwards on screen as the
// text needs more lines, and nothing reaches the store until it closes: a commit hands back the
// text and the grown rect together, so the edit is one change and one undo step. A callout's
// `rect` and `fringe` are refit around the grown box and its callout (`grownFreeText`).
//
// Inline styles here are structural or geometric only: the editor's position and minimum
// height, the box's `visibility` while it is covered, and the element's grown height.
import { freeTextBox } from '../model/annotations/callout'
import { hasCallout, isBubble, resizedBox, withBox } from '../model/annotations/edit'

import { freeTextLocalBox, refitBubble, styleFreeText } from './overlay-render'

import type { PageTransform } from './transform'
import type { AnnotationStore } from '../model/annotations/store'
import type { Annotation, FreeTextAnnotation } from '../model/annotations/types'
import type { Point, Rect } from '../model/geometry'

export interface FreeTextEditor {
  /** Closes the editor, handing its text to `commit` (true) or calling `cancel` (false). */
  close(commit: boolean): void
}

export interface FreeTextEditorOptions {
  transform: PageTransform
  /**
   * The edited text and the box's rect, grown to fit it (`grownFreeText`), in user space.
   * `grown` is the growth alone, in CSS px (0 when the box kept its height), for a caller whose
   * box may have moved or been resized while the editor was open.
   */
  commit(contents: string, rect: Rect, grown: number): void
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
/** The editor's narrowest width, in ems of the box's font size, for a box inset to nothing. */
const MIN_WIDTH_EM = 2

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
  // The element covers the rect; the text box sits inside it, inset by any fringe.
  const base = opts.transform.toCssRect(a.rect)
  const inner = freeTextLocalBox(a, opts.transform)
  const box = el.querySelector<HTMLElement>(':scope > .ink-free-text')

  const field = doc.createElement('div')
  field.className = 'ink-free-text'
  field.dataset.inkEditor = ''
  field.setAttribute('role', 'textbox')
  field.setAttribute('aria-multiline', 'true')
  field.setAttribute('aria-label', 'Text box')
  styleFreeText(field, a, opts.transform)
  field.style.position = 'absolute'
  field.style.left = `${inner.left}px`
  field.style.top = `${inner.top}px`
  // A fringe can leave a box too narrow to type in: never narrower than a couple of letters.
  const floor = opts.transform.toCssLength(a.defaultStyle.fontSize * MIN_WIDTH_EM)
  field.style.width = a.fringe ? `${Math.max(inner.width, floor)}px` : '100%'
  field.style.height = 'auto'
  field.style.minHeight = `${inner.height}px`
  field.style.pointerEvents = 'auto'
  makeEditable(field)
  field.textContent = a.contents
  if (box) box.style.visibility = 'hidden'
  el.append(field)

  /** The box's CSS height for the text now in it: never less than it started at. */
  const height = (): number =>
    Math.max(inner.height, field.getBoundingClientRect().height)
  /** `a` with its box grown by `grown` CSS px. */
  const grownTo = (grown: number): FreeTextAnnotation =>
    grown === 0 ? a : { ...a, ...grownFreeText(a, grown, opts.transform) }
  const grow = (): void => {
    const h = height()
    el.style.height = `${base.height + h - inner.height}px`
    // A bubble's outline grows with its text.
    refitBubble(el, grownTo(h - inner.height), opts.transform, base)
  }
  const Observer = view?.ResizeObserver
  const observer = Observer ? new Observer(grow) : undefined
  observer?.observe(field)

  const read = (): string => {
    const text = field.innerText.replace(/\r\n?/g, '\n')
    // A trailing line break is held open by a placeholder <br>, which reads as one more.
    return field.lastChild?.nodeName === 'BR' ? text.replace(/\n$/, '') : text
  }
  /** How far the box grew, CSS px; 0 within `SAME_PX`. */
  const growth = (): number => {
    const grown = height() - inner.height
    return Math.abs(grown) < SAME_PX ? 0 : grown
  }

  let closed = false
  const finish = (commit: boolean): void => {
    if (closed) return
    closed = true
    const contents = read()
    const grown = growth()
    const next = grownTo(grown).rect
    observer?.disconnect()
    view?.removeEventListener('pointerdown', onOutside, true)
    editors.delete(el)
    // While the editor has focus, it moves to the box before the editor goes, so it never
    // falls back to <body>. Focus that already left (a click on a control) stays where it is.
    if (field.contains(doc.activeElement)) el.focus({ preventScroll: true })
    field.remove()
    box?.style.removeProperty('visibility')
    el.style.height = `${base.height}px`
    refitBubble(el, a, opts.transform, base)
    if (commit) opts.commit(contents, next, grown)
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
 * True when `a` can be edited in place on its overlay element `el`: an unlocked free-text box
 * the overlay draws itself. Embedded boxes (painted on the canvas, with only a hit area here)
 * and host-rendered (`data-custom`) elements are not. Every edit path asks this.
 */
export function canEditFreeText(
  a: Annotation | undefined,
  el: Element | null | undefined
): a is FreeTextAnnotation {
  return (
    a !== undefined &&
    a.type === 'freetext' &&
    !a.locked &&
    a.source !== 'pdf' &&
    !!el &&
    !el.hasAttribute('data-custom')
  )
}

/**
 * Opens an editor on the overlay element `el` for the free-text box `id`, wired to the store: a
 * commit is one `update` with the text and the grown rect (none when neither changed), and an
 * empty box is removed, as an abandoned note is. A speech bubble is the exception: its outline
 * shows without text, so it is kept. Returns undefined when the box cannot be
 * edited (`canEditFreeText`).
 */
export function editFreeTextIn(
  store: AnnotationStore,
  el: HTMLElement,
  id: string,
  transform: PageTransform
): FreeTextEditor | undefined {
  const a = store._getProposed(id) ?? store.get(id)
  if (!canEditFreeText(a, el)) return undefined
  const current = (): FreeTextAnnotation | undefined => {
    const now = store._getProposed(id) ?? store.get(id)
    return now?.type === 'freetext' ? now : undefined
  }
  return editFreeText(el, a, {
    transform,
    commit(contents, _rect, grown) {
      const now = current()
      if (!now) return
      if (contents.trim() === '' && !isBubble(now)) {
        store.remove(id)
        return
      }
      // The growth applies to the box as it is now: it may have moved while the editor was open.
      if (grown === 0) {
        if (contents !== now.contents) store.update(id, { contents })
        return
      }
      store.update(id, { contents, ...grownFreeText(now, grown, transform) })
    },
    cancel() {
      const now = current()
      if (now && now.contents.trim() === '' && !isBubble(now)) store.remove(id)
    },
  })
}

/**
 * The patch that grows a free text's text box down the screen by `grown` CSS px, its top edge
 * fixed, with `rect` and `fringe` refit. A callout's last point moves with the box edge it sits
 * on. A bubble's tip below the box comes down with it; a standard callout's tip and bend stay on
 * what they point at.
 */
export function grownFreeText(
  a: FreeTextAnnotation,
  grown: number,
  t: PageTransform
): Partial<FreeTextAnnotation> {
  const css = t.toCssRect(freeTextBox(a))
  const box = t.fromCssRect({ ...css, height: css.height + grown })
  if (!hasCallout(a)) return withBox(a, box)
  const resized = resizedBox(a, box)
  if (!isBubble(a) || t.toCss(a.callout[0]).y <= css.top + css.height) return resized
  const last = a.callout.length - 1
  const down = (p: Point): Point => {
    const c = t.toCss(p)
    return t.fromCss({ x: c.x, y: c.y + grown })
  }
  return withBox(
    a,
    box,
    resized.callout!.map((p, i) => (i === last ? p : down(p)))
  )
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
