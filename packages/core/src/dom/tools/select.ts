import { createSelectionEdit, type SelectionEdit } from './selection-edit'

import type { Tool } from './controller'

/**
 * Rectangle select: a drag on empty space draws a marquee that selects the annotations it
 * touches (`Shift` adds to the selection). Presses on annotations select, move and resize them
 * as `select-text` does (selection-edit.ts).
 */
export function selectTool(): Tool {
  let edit: SelectionEdit | undefined
  return {
    id: 'select',
    cursor: 'default',
    activate(ctx) {
      edit = createSelectionEdit(ctx, { marquee: true })
    },
    deactivate() {
      edit?.reset()
      edit = undefined
    },
    onPointerDown: (e, hit, id) => edit?.onPointerDown(e, hit, id),
    onPointerMove: (e, hit) => edit?.onPointerMove(e, hit),
    onPointerUp: (e, hit) => edit?.onPointerUp(e, hit),
    onPointerCancel: () => edit?.onPointerCancel(),
    onKeyDown: (e) => edit?.onKeyDown(e),
  }
}
