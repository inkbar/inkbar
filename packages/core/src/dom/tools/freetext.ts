// A click places a text box with its top-left corner at the press, a drag sizes one, and Enter
// on the viewport places one at the centre of the current page. Each new box opens straight
// into the in-place editor, and joins the store, selected, once it has text. The live draft is
// `.ink-draft[data-ink-draft='freetext']`, `position:absolute; pointer-events:none`: geometry
// only, the look is the theme's.
import { closedEditor, editFreeText, type FreeTextEditor } from '../freetext-editor'
import { renderAnnotationContent } from '../overlay-render'

import {
  clampedCssIn,
  isViewportEnter,
  type PageHit,
  type Tool,
  type ToolContext,
} from './controller'

import type { AnnotationInput } from '../../model/annotations/types'
import type { CssRect } from '../transform'

type FreeTextInput = Extract<AnnotationInput, { type: 'freetext' }>

/** Width of a box placed with a click or Enter, user-space points. */
export const DEFAULT_FREETEXT_WIDTH = 144

/** Line height as a multiple of the font size, as the theme sets it. */
const LINE_HEIGHT = 1.2

/** Font size a box gets when neither the text group nor the input sets one, points. */
const FONT_SIZE = 12

/** Smallest drag, in CSS px on each axis, that sizes a box rather than counting as a click. */
const MIN_CSS = 3

export function freetextTool(): Tool {
  let ctx: ToolContext | undefined
  let start: PageHit | undefined
  let draft: HTMLElement | undefined

  const clear = (): void => {
    draft?.remove()
    draft = undefined
    start = undefined
  }

  /** The new box being typed into: it joins the store on its first non-empty commit. */
  let pending: FreeTextEditor | undefined

  /**
   * Opens an editor on a new box on `page` over `css` (the page host's CSS px), or, without a
   * box, one line high and `DEFAULT_FREETEXT_WIDTH` wide with its top-left at `at` (or centred
   * on it). The box is a stand-in element until the first commit with text, which adds and
   * selects it: creating and typing are one change and one undo step, and an empty box never
   * reaches the store.
   */
  const place = (
    c: ToolContext,
    page: number,
    css: CssRect | { at: { x: number; y: number }; centred: boolean }
  ): void => {
    const host = c.viewport.hostFor(page)
    if (!host) return
    pending?.close(true)
    const t = c.viewport.transformFor(page)
    const blank: FreeTextInput = { type: 'freetext', page, contents: '' }
    const input = c.toolStyle.resolve('text', blank)
    let box: CssRect
    if ('at' in css) {
      const size = input.defaultStyle?.fontSize ?? FONT_SIZE
      const border = input.width ?? 0
      const width = t.toCssLength(DEFAULT_FREETEXT_WIDTH)
      const height = t.toCssLength(size * LINE_HEIGHT + border * 2)
      box = css.centred
        ? { left: css.at.x - width / 2, top: css.at.y - height / 2, width, height }
        : { left: css.at.x, top: css.at.y, width, height }
    } else {
      box = css
    }
    const draftBox = c.store.completeInput({ ...input, rect: t.fromCssRect(box) })
    if (draftBox.type !== 'freetext') return
    const doc = host.ownerDocument
    // Laid out as the overlay lays out an annotation, on top of the page's layers.
    const el = doc.createElement('div')
    el.className = 'ink-annotation'
    el.dataset.inkPending = ''
    el.dataset.type = 'freetext'
    el.tabIndex = -1
    el.style.cssText = `position:absolute;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;pointer-events:none;`
    host.append(el)
    renderAnnotationContent(el, draftBox, t)

    // A new zoom or rotation, or the page unmounting, commits the box as it stands.
    const view = [c.viewport.scale, c.viewport.rotation].map((r) =>
      r.subscribe(() => editor.close(true))
    )
    const done = (): void => {
      view.forEach((stop) => stop())
      el.remove()
      if (pending === editor) pending = undefined
    }
    /** After the stand-in goes: focus the new box, else the viewport, never <body>. */
    const refocus = (id?: string): void => {
      // Focus that already moved on (a click on a control) stays there.
      const active = doc.activeElement
      if (active && active !== doc.body && active !== el) return
      const drawn =
        id === undefined
          ? null
          : c.root.querySelector<HTMLElement>(`[data-annotation="${CSS.escape(id)}"]`)
      if (drawn) drawn.focus({ preventScroll: true })
      else {
        if (!c.root.hasAttribute('tabindex')) c.root.tabIndex = -1
        c.root.focus({ preventScroll: true })
      }
    }
    const editor = editFreeText(el, draftBox, {
      transform: t,
      commit(contents, rect) {
        done()
        if (contents.trim() === '') return refocus()
        const created = c.store.add({ ...input, id: draftBox.id, contents, rect })
        c.store.select([created.id])
        refocus(created.id)
      },
      cancel() {
        done()
        refocus()
      },
    })
    pending = editor
  }

  const paint = (from: PageHit, e: PointerEvent): void => {
    const css = clampedCssIn(from.host, e)
    if (!draft) {
      draft = from.host.ownerDocument.createElement('div')
      draft.className = 'ink-draft'
      draft.dataset.inkDraft = 'freetext'
      draft.style.position = 'absolute'
      draft.style.pointerEvents = 'none'
      from.host.append(draft)
    }
    draft.style.left = `${Math.min(from.css.x, css.x)}px`
    draft.style.top = `${Math.min(from.css.y, css.y)}px`
    draft.style.width = `${Math.abs(css.x - from.css.x)}px`
    draft.style.height = `${Math.abs(css.y - from.css.y)}px`
  }

  return {
    id: 'freetext',
    cursor: 'text',
    styleGroup: 'text',
    defaultOptions: {},
    activate(c) {
      ctx = c
    },
    deactivate() {
      clear()
      pending?.close(true)
      ctx = undefined
    },
    onPointerDown(e, hit, annotationId) {
      // A press that ended an edit only ends it.
      if (!hit || annotationId !== undefined || closedEditor(e)) return
      start = hit
      // Keeps the press from starting a text selection or taking focus from the editor to be.
      e.preventDefault()
      return true
    },
    onPointerMove(e) {
      if (!start) return
      if (e.buttons === 0 || !start.host.isConnected) {
        clear()
        return
      }
      paint(start, e)
    },
    onPointerCancel() {
      clear()
    },
    onPointerUp(e) {
      const from = start
      clear()
      if (!ctx || !from || !from.host.isConnected) return
      const css = clampedCssIn(from.host, e)
      const dx = Math.abs(css.x - from.css.x)
      const dy = Math.abs(css.y - from.css.y)
      if (dx >= MIN_CSS && dy >= MIN_CSS) {
        place(ctx, from.page, {
          left: Math.min(from.css.x, css.x),
          top: Math.min(from.css.y, css.y),
          width: dx,
          height: dy,
        })
      } else {
        place(ctx, from.page, { at: from.css, centred: false })
      }
    },
    onKeyDown(e) {
      if (!ctx || !isViewportEnter(e, ctx.root)) return
      e.preventDefault()
      const page = ctx.viewport.currentPage.get()
      const t = ctx.viewport.transformFor(page)
      const { box } = t.page
      const middle = t.toCss({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
      place(ctx, page, { at: middle, centred: true })
    },
  }
}
