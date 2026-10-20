import { useInkContext } from '../context.js'
import { useReadable } from '../use-readable.svelte.js'

import type { ToolId } from '@inkbar/core/dom'

const NO_OPTIONS: object = {}

/**
 * A tool's options and a setter that merges a patch into them without switching tools.
 * `id` may be a getter. Options are empty, and the setter does nothing, until the viewport
 * has mounted.
 */
export function useToolOptions<O extends object = object>(
  id: ToolId | (() => ToolId)
): { readonly options: O; setOptions: (patch: Partial<O>) => void } {
  const ctx = useInkContext('useToolOptions()')
  const toolId = (): ToolId => (typeof id === 'function' ? id() : id)
  const options = useReadable(() => ctx.tools?.options(toolId()), NO_OPTIONS)
  return {
    get options() {
      return options.current as O
    },
    setOptions: (patch) => ctx.tools?.setOptions(toolId(), patch),
  }
}
