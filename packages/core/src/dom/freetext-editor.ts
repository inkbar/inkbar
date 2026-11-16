// In-place editing for a free-text box. The editor is a plain-text `contenteditable` laid over
// the box's text area inside its overlay element, with the font stack and size the box is drawn in
// and no border or background of its own. The box underneath (fill, border, leader line, bubble)
// is painted from the description of the annotation as it grows, without its text, which the
// editor shows instead. The editor turns with the view, so it lies on the text as drawn, and grows
// along the text's own downward direction as the text needs more lines. Nothing reaches the store
// until it closes: a commit hands back the text and the grown rect together, so the edit is one
// change and one undo step. A callout's `rect` and `fringe` are refit around the grown box and its
// callout (`grownFreeText`).
//
// Inline styles here are structural or geometric only, apart from the text's own look, which comes
// from the annotation and so is set here rather than by the theme.
import { en } from '../messages'
import { freeTextBox } from '../model/annotations/callout'
import { freeTextFrame } from '../model/annotations/drawing/freetext'
import { resolveFont } from '../model/annotations/drawing/text/measure'
import { hasCallout, isBubble, resizedBox, withBox } from '../model/annotations/edit'

import { drawContext } from './drawing-context'
import { annotationBox, renderAnnotationContent } from './overlay-render'
import { htmlBaseline } from './text-baseline'
import { FONT_STACKS } from './text-fonts'
import { normalizeRotation, type PageTransform } from './transform'

import type { AnnotationStore } from '../model/annotations/store'
import type { Annotation, FreeTextAnnotation } from '../model/annotations/types'
import type { Rect } from '../model/geometry'

export interface FreeTextEditor {
  /** Closes the editor, handing its text to `commit` (true) or calling `cancel` (false). */
  close(commit: boolean): void
}

/**
 * What closed an editor: Escape, a press outside it, focus leaving it, or a call to `close`
 * (a redraw, the page unmounting, the box being removed, a tool switch).
 */
export type EditorCloseReason = 'escape' | 'press' | 'focus' | 'api'

export interface FreeTextEditorOptions {
  transform: PageTransform
  /**
   * The edited text and the box's rect, grown to fit it (`grownFreeText`), in user space.
   * `grown` is the growth alone, in CSS px (0 when the box kept its height), for a caller whose
   * box may have moved or been resized while the editor was open. `how` says what closed it.
   */
  commit(contents: string, rect: Rect, grown: number, how: EditorCloseReason): void
  cancel(): void
  /** Where to put the caret, a client point (a click on the box); at the end when absent. */
  caret?: { clientX: number; clientY: number } | undefined
  /** The editor's accessible name. Default `en.annotations.freetext` ("Text box"). */
  label?: string | undefined
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
 * store yet), with the caret at `opts.caret` or after the text. `Escape` commits; a press
 * outside the editor, or focus leaving it, commits too.
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
  const t = opts.transform
  const rotate = t.page.rotate
  // The text turns with the view: its angle on screen is the view's turn on top of the file's.
  const turn = normalizeRotation(t.totalRotation - rotate)
  const sideways = turn === 90 || turn === 270
  const frame = freeTextFrame(a, rotate)
  const s = a.defaultStyle
  const font = resolveFont(
    s.fontFamily,
    s.fontWeight === 'bold',
    s.fontStyle === 'italic'
  )
  const fontSize = t.toCssLength(s.fontSize)
  // Where the first baseline is below the area's top, drawn and in HTML. Blink rounds the font's
  // ascent and descent to whole pixels, so the editor is moved by the difference.
  const { ascent, descent } = drawContext(t).measure.vertical(font)
  const drawn = ((1.2 - (ascent + descent)) / 2 + ascent) * fontSize
  const shift = drawn - htmlBaseline(doc, font, fontSize)
  const areaWidth = t.toCssLength(frame.area.width)
  const areaHeight = t.toCssLength(frame.area.height)
  const kept = {
    left: el.style.left,
    top: el.style.top,
    width: el.style.width,
    height: el.style.height,
  }

  const field = doc.createElement('div')
  field.className = 'ink-free-text'
  field.dataset.inkEditor = ''
  field.setAttribute('role', 'textbox')
  field.setAttribute('aria-multiline', 'true')
  field.setAttribute('aria-label', opts.label ?? en.annotations.freetext)
  // The text's look, as the drawing paints it: same stack and size, no kerning, wrapped and
  // aligned as the box says.
  field.style.cssText =
    `position:absolute;box-sizing:border-box;margin:0;padding:0;border:0;background:transparent;` +
    `line-height:1.2;white-space:pre-wrap;overflow-wrap:break-word;font-kerning:none;` +
    `transform-origin:0 0;transform:rotate(${turn}deg) translate(0px,${shift}px);` +
    `font-family:${FONT_STACKS[font.family]};font-size:${fontSize}px;` +
    `font-weight:${font.bold ? 'bold' : 'normal'};font-style:${font.italic ? 'italic' : 'normal'};` +
    `text-decoration:${s.textDecoration === 'underline' ? 'underline' : 'none'};` +
    `color:${s.color};caret-color:${s.color};text-align:${s.textAlign};`
  // Exactly as wide as the layout wraps to, so the editor breaks lines where the drawing does.
  field.style.width = `${areaWidth}px`
  field.style.height = 'auto'
  field.style.minHeight = `${areaHeight}px`
  field.style.pointerEvents = 'auto'
  makeEditable(field)
  field.textContent = a.contents
  el.append(field)

  /** The editor's own height (along the text's down direction) for the text now in it. */
  const fieldHeight = (): number => {
    const r = field.getBoundingClientRect()
    return sideways ? r.width : r.height
  }
  /** The box's text area height in CSS px for the text now in it: never less than it started at. */
  const height = (): number => Math.max(areaHeight, fieldHeight())
  /** `a` with its box grown by `grown` CSS px. */
  const grownTo = (grown: number): FreeTextAnnotation =>
    grown === 0 ? a : { ...a, ...grownFreeText(a, grown, t) }
  /** Lays the box out and paints it, without its text, as `draft`; the editor goes to its text area. */
  /**
   * Paints `draft` into `el` behind the editor and the selection handles, which stay: removing
   * them would drop the selection's handles, and moving the focused editor would drop its focus.
   */
  const repaint = (draft: FreeTextAnnotation): void => {
    const holder = doc.createElement('div')
    renderAnnotationContent(holder, draft, t)
    for (const child of [...el.children])
      if (child !== field && !child.hasAttribute('data-handle')) child.remove()
    el.prepend(...holder.childNodes)
  }
  const sync = (draft: FreeTextAnnotation): void => {
    const box = annotationBox(draft, t)
    el.style.left = `${box.left}px`
    el.style.top = `${box.top}px`
    el.style.width = `${box.width}px`
    el.style.height = `${box.height}px`
    repaint({ ...draft, contents: '' })
    const at = t.toCss(freeTextFrame(draft, rotate).area.topLeft)
    field.style.left = `${at.x - box.left}px`
    field.style.top = `${at.y - box.top}px`
  }
  const grow = (): void => sync(grownTo(height() - areaHeight))
  // In place before the caret is: a click's point is read against the editor where it will be.
  sync(a)
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
    const grown = height() - areaHeight
    return Math.abs(grown) < SAME_PX ? 0 : grown
  }

  let closed = false
  const finish = (commit: boolean, how: EditorCloseReason): void => {
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
    Object.assign(el.style, kept)
    // The box as it was: the editor's repaints left it without its text.
    repaint(a)
    if (commit) opts.commit(contents, next, grown, how)
    else opts.cancel()
  }

  const onOutside = (e: Event): void => {
    if (e.target instanceof Node && field.contains(e.target)) return
    closingPresses.add(e)
    finish(true, 'press')
  }
  view?.addEventListener('pointerdown', onOutside, true)
  field.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape' && !e.isComposing) {
      e.preventDefault()
      finish(true, 'escape')
    }
  })
  field.addEventListener('focusout', (e) => {
    // A window losing focus (another tab, devtools) leaves the edit open.
    if (!doc.hasFocus()) return
    const to = e.relatedTarget
    if (to instanceof Node && field.contains(to)) return
    finish(true, 'focus')
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
    let range = opts.caret && caretIn(field, opts.caret)
    if (!range) {
      range = doc.createRange()
      range.selectNodeContents(field)
      range.collapse(false)
    }
    selection.removeAllRanges()
    selection.addRange(range)
  }
  grow()

  const editor: FreeTextEditor = { close: (commit) => finish(commit, 'api') }
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
 * shows without text, so it is kept. `onClose` runs after the store change, with what closed
 * the editor; `caret` is a client point to put the caret at (`editFreeText`). Returns
 * undefined when the box cannot be edited (`canEditFreeText`).
 */
export function editFreeTextIn(
  store: AnnotationStore,
  el: HTMLElement,
  id: string,
  transform: PageTransform,
  opts: {
    onClose?(how: EditorCloseReason): void
    caret?: { clientX: number; clientY: number }
    label?: string | undefined
  } = {}
): FreeTextEditor | undefined {
  const a = store._getProposed(id) ?? store.get(id)
  if (!canEditFreeText(a, el)) return undefined
  const current = (): FreeTextAnnotation | undefined => {
    const now = store._getProposed(id) ?? store.get(id)
    return now?.type === 'freetext' ? now : undefined
  }
  const write = (contents: string, grown: number): void => {
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
  }
  return editFreeText(el, a, {
    transform,
    caret: opts.caret,
    label: opts.label,
    commit(contents, _rect, grown, how) {
      write(contents, grown)
      opts.onClose?.(how)
    },
    cancel() {
      const now = current()
      if (now && now.contents.trim() === '' && !isBubble(now)) store.remove(id)
      opts.onClose?.('api')
    },
  })
}

/**
 * The patch that grows a free text's text box by `grown` CSS px along its text's downward
 * direction in user space (the text is upright for the page as the file displays it), its top edge
 * fixed, with `rect` and `fringe` refit. A callout's last point moves with the box edge it sits
 * on. A bubble's tip below the box comes down with it; a standard callout's tip and bend stay on
 * what they point at.
 */
export function grownFreeText(
  a: FreeTextAnnotation,
  grown: number,
  t: PageTransform
): Partial<FreeTextAnnotation> {
  const by = grown / t.toCssLength(1)
  const frame = freeTextFrame(a, t.page.rotate)
  const { down } = frame
  const was = freeTextBox(a)
  const box = {
    x: was.x + Math.min(0, down.x * by),
    y: was.y + Math.min(0, down.y * by),
    width: was.width + Math.abs(down.x) * by,
    height: was.height + Math.abs(down.y) * by,
  }
  if (!hasCallout(a)) return withBox(a, box)
  const resized = resizedBox(a, box)
  const tip = a.callout[0]
  const depth = (tip.x - frame.topLeft.x) * down.x + (tip.y - frame.topLeft.y) * down.y
  if (!isBubble(a) || depth <= frame.height) return resized
  const last = a.callout.length - 1
  return withBox(
    a,
    box,
    resized.callout!.map((p, i) =>
      i === last ? p : { x: p.x + down.x * by, y: p.y + down.y * by }
    )
  )
}

/**
 * A collapsed range at the text position under a client point, if that position is in `field`.
 * The editor lies over the box with the same look, so a point on the box lands on the same
 * character in the editor.
 */
function caretIn(
  field: HTMLElement,
  at: { clientX: number; clientY: number }
): Range | undefined {
  const doc = field.ownerDocument
  let node: Node | undefined
  let offset = 0
  if (typeof doc.caretPositionFromPoint === 'function') {
    const p = doc.caretPositionFromPoint(at.clientX, at.clientY)
    if (p) ({ offsetNode: node, offset } = p)
  } else if (typeof doc.caretRangeFromPoint === 'function') {
    const r = doc.caretRangeFromPoint(at.clientX, at.clientY)
    if (r) ({ startContainer: node, startOffset: offset } = r)
  }
  if (!node || !field.contains(node)) return undefined
  const range = doc.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  return range
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
