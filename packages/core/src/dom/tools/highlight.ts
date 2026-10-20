import { isViewportEnter, type Tool, type ToolContext } from './controller'

/**
 * Turns the text selection into one highlight per page when the pointer is released, or on
 * Enter in the viewport (a keyboard selection). Without a selection both do nothing.
 */
export function highlightTool(): Tool {
  let ctx: ToolContext | undefined
  const convert = (): boolean => {
    if (!ctx) return false
    const selections = ctx.selectionQuads()
    if (selections.length === 0) return false
    for (const s of selections) {
      ctx.store.add(
        ctx.toolStyle.resolve('markup', {
          type: 'highlight',
          page: s.page,
          quads: s.quads,
          contents: s.text,
        })
      )
    }
    ctx.clearSelection()
    return true
  }
  return {
    id: 'highlight',
    cursor: 'text',
    styleGroup: 'markup',
    activate(c) {
      ctx = c
    },
    deactivate() {
      ctx = undefined
    },
    onPointerUp() {
      convert()
    },
    onKeyDown(e) {
      if (!!ctx && isViewportEnter(e, ctx.root) && convert()) e.preventDefault()
    },
  }
}
