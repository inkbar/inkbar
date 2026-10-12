// The live draft is `position:absolute; pointer-events:none` with left/top/width/height from
// the drag: geometry only. Its look comes from the theme (`.ink-draft[data-ink-draft]`).
import { clampedCssIn, type PageHit, type Tool, type ToolContext } from './controller'

/** Smallest drag, in CSS px on each axis, that draws a box rather than counting as a click. */
const MIN_CSS = 3

export function redactAreaTool(): Tool {
  let ctx: ToolContext | undefined
  let start: PageHit | undefined
  let draft: HTMLElement | undefined

  const clear = (): void => {
    draft?.remove()
    draft = undefined
    start = undefined
  }

  return {
    id: 'redact-area',
    cursor: 'crosshair',
    activate(c) {
      ctx = c
    },
    deactivate() {
      clear()
      ctx = undefined
    },
    onPointerDown(e, hit, annotationId) {
      if (!hit || annotationId !== undefined) return
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
        ctx.store.add({ type: 'redact', page: start.page, rect })
      } else {
        const selections = ctx.selectionQuads()
        for (const s of selections)
          ctx.store.add({ type: 'redact', page: s.page, quads: s.quads })
        if (selections.length > 0) ctx.clearSelection()
      }
      clear()
    },
  }
}
