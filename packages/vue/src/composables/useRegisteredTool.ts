import { unknownTool, withHostTools } from '@inkbar/core/dom'
import { computed, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

import { useInkContext, type InkContext } from '../context'

import type { PluginHost, Tool, ToolId } from '@inkbar/core/dom'

/** `select-text` and `select`, then the host's tools, then the plugins' tools, by id. */
export function toolIdsOf(
  hostTools: readonly Tool[] | undefined,
  pluginHost: PluginHost | null
): ToolId[] {
  return withHostTools([...(hostTools ?? []), ...(pluginHost?.tools ?? [])]).map(
    (t) => t.id
  )
}

/**
 * The tools a control may use: those in `tools` and the plugins now that the open viewer was
 * also built with, so a control never offers a tool the viewer would refuse. A tool added to
 * `tools` counts from the next open; one removed stops at once. With no viewer, `tools` and
 * the plugins alone.
 */
export function registeredToolIds(
  hostTools: readonly Tool[] | undefined,
  pluginHost: PluginHost | null,
  opened: readonly ToolId[] | null
): ToolId[] {
  const ids = toolIdsOf(hostTools, pluginHost)
  return opened ? ids.filter((id) => opened.includes(id)) : ids
}

const idsIn = (ctx: InkContext): ToolId[] =>
  registeredToolIds(ctx.hostTools.value, ctx.pluginHost.value, ctx.openedToolIds.value)

/** Whether a tool by this id is registered, without logging anything when it is not. */
export function useHasTool(
  ctx: InkContext,
  id: MaybeRefOrGetter<ToolId>
): Readonly<Ref<boolean>> {
  return computed(() => idsIn(ctx).includes(toValue(id)))
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
      console.error(unknownTool(toValue(id), idsIn(ctx)))
    },
    { immediate: true }
  )
  return registered
}
