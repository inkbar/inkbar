import { unknownTool, withHostTools } from '@inkbar/core/dom'
import { computed, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

import { useInkContext, type InkContext } from '../context'

import type { PluginHost, Tool, ToolId } from '@inkbar/core/dom'

/** `select-text` and `select`, then the host's tools, then the plugins' tools, by id. */
export function registeredToolIds(
  hostTools: readonly Tool[] | undefined,
  pluginHost: PluginHost | null
): ToolId[] {
  return withHostTools([...(hostTools ?? []), ...(pluginHost?.tools ?? [])]).map(
    (t) => t.id
  )
}

/** Whether a tool by this id is registered, without logging anything when it is not. */
export function useHasTool(
  ctx: InkContext,
  id: MaybeRefOrGetter<ToolId>
): Readonly<Ref<boolean>> {
  return computed(() =>
    registeredToolIds(ctx.hostTools.value, ctx.pluginHost.value).includes(toValue(id))
  )
}

/**
 * Whether a tool by this id is registered: always for `select-text` and `select`, else when
 * InkRoot's `tools` or a plugin has it. When it is not, once the plugins are set up, this logs
 * `InkError('UnknownTool')` to the console, once per component.
 */
export function useRegisteredTool(id: MaybeRefOrGetter<ToolId>): Readonly<Ref<boolean>> {
  const ctx = useInkContext('useRegisteredTool()')
  const registered = useHasTool(ctx, id)
  let logged = false
  // The plugins' tools are known once InkRoot has mounted and set up its plugin host.
  watch(
    [() => ctx.pluginHost.value !== null, registered],
    ([ready, ok]) => {
      if (!ready || ok || logged) return
      logged = true
      console.error(
        unknownTool(
          toValue(id),
          registeredToolIds(ctx.hostTools.value, ctx.pluginHost.value)
        )
      )
    },
    { immediate: true }
  )
  return registered
}
