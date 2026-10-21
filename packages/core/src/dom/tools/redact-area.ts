// The live draft is `position:absolute; pointer-events:none` with left/top/width/height from
// the drag: geometry only. Its look comes from the theme (`.ink-draft[data-ink-draft]`).
import { isTextMarkup } from '../../model/annotations/edit'

import {
  clampedCssIn,
  isViewportEnter,
  type PageHit,
  type Tool,
  type ToolContext,
} from './controller'

/** Smallest drag, in CSS px on each axis, that draws a box rather than counting as a click. */
const MIN_CSS = 3

export function redactAreaTool(): Tool {
  let ctx: ToolContext | undefined
  let start: PageHit | undefined
  let draft: HTMLElement | undefined

  /** Selects what the tool just added, together, and reports it made. */
  const made = (c: ToolContext, ids: string[]): void => {
    c.store.select(ids)
    c.made(ids)
  }

  /** Text redactions from the live selection, one per page. False when nothing is selected. */
  const fromSelection = (): boolean => {
    if (!ctx) return false
    const selections = ctx.selectionQuads()
    if (selections.length === 0) return false
    const c = ctx
    const ids = selections.map(
      (s) =>
        c.store.add(
          c.toolStyle.resolve('redact', { type: 'redact', page: s.page, quads: s.quads })
        ).id
    )
    c.clearSelection()
    made(c, ids)
    return true
  }

  const clear = (): void => {
    draft?.remove()
    draft = undefined
    start = undefined
  }

  return {
    id: 'redact-area',
    kind: 'one-shot',
    cursor: 'crosshair',
    styleGroup: 'redact',
    activate(c) {
      ctx = c
    },
    deactivate() {
      clear()
      ctx = undefined
    },
    onPointerDown(e, hit, annotationId) {
      if (!hit) return
      if (annotationId !== undefined) {
        // Text markup would let a drag through to text selection, which the next click here
        // turns into a text redaction. Claim the press instead, as rectangle select does: a
        // drag from markup draws an area, and a click redacts the live selection.
        const a = ctx?.store.get(annotationId)
        if (!a || !isTextMarkup(a)) return
        e.stopPropagation()
      }
      start = hit
      // Keeps the press from starting a text selection; an existing one survives for the
      // text-derived mode on pointerup.
      e.preventDefault()
      return true
    },
    onPointerMove(e) {
      if (!start) return
      // No button down: the release was missed, so drop the draft. A host scrolled out of
      // the mounted range is gone with it.
      if (e.buttons === 0 || !start.host.isConnected) {
        clear()
        return
      }
      const css = clampedCssIn(start.host, e)
      if (!draft) {
        draft = start.host.ownerDocument.createElement('div')
        draft.className = 'ink-draft'
        draft.dataset.inkDraft = 'redact'
        draft.style.position = 'absolute'
        draft.style.pointerEvents = 'none'
        start.host.append(draft)
      }
      draft.style.left = `${Math.min(start.css.x, css.x)}px`
      draft.style.top = `${Math.min(start.css.y, css.y)}px`
      draft.style.width = `${Math.abs(css.x - start.css.x)}px`
      draft.style.height = `${Math.abs(css.y - start.css.y)}px`
    },
    onPointerCancel() {
      clear()
    },
    onPointerUp(e) {
      if (!ctx || !start) return
      if (!start.host.isConnected) {
        clear()
        return
      }
      const css = clampedCssIn(start.host, e)
      const width = Math.abs(css.x - start.css.x)
      const height = Math.abs(css.y - start.css.y)
      if (width >= MIN_CSS && height >= MIN_CSS) {
        const rect = start.transform.fromCssRect({
          left: Math.min(start.css.x, css.x),
          top: Math.min(start.css.y, css.y),
          width,
          height,
        })
        const a = ctx.store.add(
          ctx.toolStyle.resolve('redact', { type: 'redact', page: start.page, rect })
        )
        made(ctx, [a.id])
      } else {
        fromSelection()
      }
      clear()
    },
    onKeyDown(e) {
      // The keyboard path for text marks: select text, then Enter.
      if (!!ctx && isViewportEnter(e, ctx.root) && fromSelection()) e.preventDefault()
    },
  }
}
