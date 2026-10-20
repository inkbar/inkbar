import { createSelectionEdit, type SelectionEdit } from './selection-edit'

import type { Tool } from './controller'

/**
 * The default tool. Text selection stays native: presses on text, and drags across text
 * markup, select text. Presses on other annotations select them, and drags move and resize
 * them (selection-edit.ts). There is no marquee.
 */
export function selectTextTool(): Tool {
  let edit: SelectionEdit | undefined
  return {
    id: 'select-text',
    cursor: 'auto',
    activate(ctx) {
      edit = createSelectionEdit(ctx)
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
