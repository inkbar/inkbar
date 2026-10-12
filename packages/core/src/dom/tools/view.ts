import type { Tool } from './controller'

/** Reading only: text selection stays native and the overlay still selects annotations. */
export function viewTool(): Tool {
  return { id: 'view', cursor: 'auto', activate() {}, deactivate() {} }
}
