import type { PageHit, Tool, ToolContext } from './controller'

/** Side of a new note's icon box, user-space points. */
const SIZE = 20

export function noteTool(): Tool {
  let ctx: ToolContext | undefined
  let down: PageHit | undefined
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
      const a = ctx.store.add({
        type: 'note',
        page: hit.page,
        rect: {
          x: hit.user.x - SIZE / 2,
          y: hit.user.y - SIZE / 2,
          width: SIZE,
          height: SIZE,
        },
      })
      ctx.store.select([a.id])
      ctx.onActivate?.(a.id)
    },
  }
}
