import { useInkContext } from '../context.js'

import type { ToolId } from '@inkbar/core/dom'

export function useTool() {
  const ctx = useInkContext('useTool()')
  return {
    get tool() {
      return ctx.tool
    },
    setTool: (id: ToolId) => ctx.setTool(id),
  }
}
