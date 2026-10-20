import { useCallback } from 'react'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { ToolId } from '@inkbar/core/dom'

const NO_OPTIONS: object = {}

/**
 * A tool's options and a setter that merges a patch into them without switching tools.
 * Options are empty, and the setter does nothing, until the viewport has mounted.
 */
export function useToolOptions<O extends object = object>(
  id: ToolId
): [O, (patch: Partial<O>) => void] {
  const ctx = useInkContext('useToolOptions()')
  const tools = ctx.tools
  const options = useReadable(tools?.options(id), NO_OPTIONS) as O
  const setOptions = useCallback(
    (patch: Partial<O>) => tools?.setOptions(id, patch),
    [tools, id]
  )
  return [options, setOptions]
}
