import type { Tool, ToolContext } from './controller'

/** Turns the text selection into one highlight per page when the pointer is released. */
export function highlightTool(): Tool {
  let ctx: ToolContext | undefined
  return {
    id: 'highlight',
    cursor: 'text',
    activate(c) {
      ctx = c
    },
    deactivate() {
      ctx = undefined
    },
    onPointerUp() {
      if (!ctx) return
      const selections = ctx.selectionQuads()
      if (selections.length === 0) return
      for (const s of selections) {
        ctx.store.add({
          type: 'highlight',
          page: s.page,
          quads: s.quads,
          contents: s.text,
        })
      }
      ctx.clearSelection()
    },
  }
}
