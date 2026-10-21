import { isViewportEnter, type Tool, type ToolContext } from './controller'

import type { TextMarkupAnnotation } from '../../model/annotations/types'

export type MarkupKind = TextMarkupAnnotation['type']

/** The text markup kinds, in menu order. */
export const MARKUP_KINDS: readonly MarkupKind[] = [
  'highlight',
  'underline',
  'strikeout',
  'squiggly',
]

export interface HighlightOptions {
  /** Which text markup the tool makes. */
  kind: MarkupKind
}

export const DEFAULT_HIGHLIGHT_OPTIONS: Readonly<HighlightOptions> = { kind: 'highlight' }

/**
 * Turns the text selection into one markup of the chosen kind per page when the pointer is
 * released, or on Enter in the viewport (a keyboard selection), and selects what it made.
 * Without a selection both do nothing. The markup's `contents` is left for a comment: hosts
 * read the marked text with `doc.text(page)`.
 */
export function highlightTool(): Tool<HighlightOptions> {
  let ctx: ToolContext | undefined
  const convert = (): boolean => {
    if (!ctx) return false
    const selections = ctx.selectionQuads()
    if (selections.length === 0) return false
    const { kind } = { ...DEFAULT_HIGHLIGHT_OPTIONS, ...ctx.options<HighlightOptions>() }
    const ids: string[] = []
    for (const s of selections) {
      const a = ctx.store.add(
        ctx.toolStyle.resolve('markup', { type: kind, page: s.page, quads: s.quads })
      )
      ids.push(a.id)
    }
    ctx.clearSelection()
    ctx.store.select(ids)
    return true
  }
  return {
    id: 'highlight',
    kind: 'sticky',
    cursor: 'text',
    styleGroup: 'markup',
    defaultOptions: { ...DEFAULT_HIGHLIGHT_OPTIONS },
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
