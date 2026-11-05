import { InkError } from '../../model/errors'

import type { ToolId } from './controller'

/**
 * The error for a tool id nobody registered, naming the ids that were. The tool controller logs
 * it rather than throw, so a toolbar naming a missing tool shows the control as it is.
 */
export function unknownTool(id: ToolId, registered: readonly ToolId[]): InkError {
  const known = registered.length > 0 ? registered.join(', ') : 'none'
  return new InkError(
    'UnknownTool',
    `No tool ${id} is registered (registered: ${known})`,
    {
      id,
      registered,
    }
  )
}
