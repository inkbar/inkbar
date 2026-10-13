import { useMemo } from 'react'

import { useInkContext } from '../context'

export function useTool() {
  const ctx = useInkContext('useTool()')
  const { tool, setTool } = ctx
  return useMemo(() => ({ tool, setTool }), [tool, setTool])
}
