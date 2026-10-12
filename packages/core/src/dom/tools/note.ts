import { isViewportEnter, type PageHit, type Tool, type ToolContext } from './controller'

import type { Point } from '../../model/geometry'

/** Side of a new note's icon box, user-space points. */
const SIZE = 20

/** Frames to wait for a controlled host to apply a new note before giving up on focusing it. */
const FOCUS_FRAMES = 10

/**
 * Click places a note centred on the press. Enter in the viewport places one at the centre of
 * the current page and focuses it. Either way the note is selected and activated.
 */
export function noteTool(): Tool {
  let ctx: ToolContext | undefined
  let down: PageHit | undefined

  const place = (c: ToolContext, page: number, at: Point): string => {
    const a = c.store.add({
      type: 'note',
      page,
      rect: { x: at.x - SIZE / 2, y: at.y - SIZE / 2, width: SIZE, height: SIZE },
    })
    c.store.select([a.id])
    return a.id
  }

  return {
    id: 'note',
    cursor: 'copy',
    activate(c) {
      ctx = c
    },
    deactivate() {
      ctx = undefined
      down = undefined
    },
    onPointerDown(_e, hit, annotationId) {
      down = annotationId === undefined ? hit : undefined
      return down !== undefined
    },
    onPointerCancel() {
      down = undefined
    },
    onPointerUp(_e, hit) {
      const pressed = down
      down = undefined
      if (!ctx || !pressed || !hit || hit.page !== pressed.page) return
      const id = place(ctx, hit.page, hit.user)
      ctx.onActivate?.(id)
    },
    onKeyDown(e) {
      if (!ctx || !isViewportEnter(e)) return
      e.preventDefault()
      const c = ctx
      const page = c.viewport.currentPage.get()
      const { box } = c.viewport.transformFor(page).page
      const id = place(c, page, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
      focusWhenDrawn(c, id)
      c.onActivate?.(id)
    },
  }
}

/**
 * Focuses the note's overlay element. An uncontrolled store draws it synchronously; a
 * controlled host applies the change later, so wait a few frames, and give up if focus has
 * meanwhile moved off the viewport (a popover took it).
 */
function focusWhenDrawn(ctx: ToolContext, id: string): void {
  const doc = ctx.root.ownerDocument
  const find = (): HTMLElement | null =>
    ctx.root.querySelector<HTMLElement>(`[data-annotation="${CSS.escape(id)}"]`)
  const now = find()
  if (now) {
    now.focus({ preventScroll: true })
    return
  }
  let frames = 0
  const view = doc.defaultView
  const tick = (): void => {
    if (doc.activeElement !== ctx.root) return
    const el = find()
    if (el) el.focus({ preventScroll: true })
    else if (++frames < FOCUS_FRAMES) view?.requestAnimationFrame(tick)
  }
  view?.requestAnimationFrame(tick)
}
