import { useInkContext } from '../context'

import type { ToolId } from '@inkbar/core/dom'

export function useTool() {
  const ctx = useInkContext('useTool()')
  return { tool: ctx.tool, setTool: (id: ToolId) => ctx.setTool(id) }
}
