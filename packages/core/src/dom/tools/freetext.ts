// A click places a text box with its top-left corner at the press, a drag sizes one, and Enter
// on the viewport places one at the centre of the current page. Each new box is selected and
// opens straight into the in-place editor. The live draft is
// `.ink-draft[data-ink-draft='freetext']`, `position:absolute; pointer-events:none`: geometry
// only, the look is the theme's.
import { closedEditor, editFreeTextIn } from '../freetext-editor'

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

/** Frames to wait for a controlled host to apply a new box before giving up on editing it. */
const EDIT_FRAMES = 30

export function freetextTool(): Tool {
  let ctx: ToolContext | undefined
  let start: PageHit | undefined
  let draft: HTMLElement | undefined

  const clear = (): void => {
    draft?.remove()
    draft = undefined
    start = undefined
  }

  /**
   * Adds a box on `page` over `css` (the page host's CSS px), or, without a box, one line high
   * and `DEFAULT_FREETEXT_WIDTH` wide with its top-left at `at` (or centred on it). Then
   * selects it and opens the editor.
   */
  const place = (
    c: ToolContext,
    page: number,
    css: CssRect | { at: { x: number; y: number }; centred: boolean }
  ): void => {
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
    const created = c.store.add({ ...input, rect: t.fromCssRect(box) })
    c.store.select([created.id])
    editWhenDrawn(c, created.id, page)
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

/**
 * Opens the editor on the new box's overlay element. An uncontrolled store draws it
 * synchronously; a controlled host applies the change later, so wait a few frames, and give up
 * if the box never appears or something else took focus meanwhile.
 */
function editWhenDrawn(ctx: ToolContext, id: string, page: number): void {
  const doc = ctx.root.ownerDocument
  const focused = doc.activeElement
  const open = (): boolean => {
    const el = ctx.root.querySelector<HTMLElement>(
      `[data-annotation="${CSS.escape(id)}"]`
    )
    if (!el || !ctx.store.get(id)) return false
    editFreeTextIn(ctx.store, el, id, ctx.viewport.transformFor(page))
    return true
  }
  if (open()) return
  let frames = 0
  const view = doc.defaultView
  const tick = (): void => {
    if (doc.activeElement !== focused) return
    if (!open() && ++frames < EDIT_FRAMES) view?.requestAnimationFrame(tick)
  }
  view?.requestAnimationFrame(tick)
}
