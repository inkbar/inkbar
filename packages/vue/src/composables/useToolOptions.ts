import { toValue, type MaybeRefOrGetter, type Ref } from 'vue'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { ToolId } from '@inkbar/core/dom'

const NO_OPTIONS: object = {}

/**
 * A tool's options and a setter that merges a patch into them without switching tools.
 * Options are empty, and the setter does nothing, until the viewport has mounted.
 */
export function useToolOptions<O extends object = object>(
  id: MaybeRefOrGetter<ToolId>
): { options: Readonly<Ref<O>>; setOptions: (patch: Partial<O>) => void } {
  return useToolOptionsWhile<O>(id, true)
}

/**
 * `useToolOptions` that reads and sets nothing while `active` is false, so a control for a
 * missing tool leaves the controller's own `UnknownTool` log alone.
 */
export function useToolOptionsWhile<O extends object = object>(
  id: MaybeRefOrGetter<ToolId>,
  active: MaybeRefOrGetter<boolean>
): { options: Readonly<Ref<O>>; setOptions: (patch: Partial<O>) => void } {
  const ctx = useInkContext('useToolOptions()')
  const options = useReadable(
    () => (toValue(active) ? ctx.tools.value?.options(toValue(id)) : null),
    NO_OPTIONS
  ) as Readonly<Ref<O>>
  return {
    options,
    setOptions: (patch) => {
      if (toValue(active)) ctx.tools.value?.setOptions(toValue(id), patch)
    },
  }
}
