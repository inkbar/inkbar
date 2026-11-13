<script setup lang="ts">
import { toolName, withHostTools } from '@inkbar/core/dom'
import { SquareDashedMousePointer, TextCursor } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed, mergeProps, useAttrs } from 'vue'

import { useRegisteredTool } from '../composables/useRegisteredTool'
import { useTool } from '../composables/useTool'
import { useInkContext } from '../context'

import InkIcon from './InkIcon.vue'

import type { ToolId } from '@inkbar/core/dom'
import type { IconNode } from '@inkbar/icons'

const ICONS: Readonly<Partial<Record<ToolId, IconNode>>> = {
  'select-text': TextCursor,
  select: SquareDashedMousePointer,
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{ tool: ToolId; label?: string | undefined; asChild?: boolean }>(),
  { label: undefined, asChild: false }
)

const ctx = useInkContext('InkToolButton')
const { tool: current, setTool } = useTool()
const active = computed(() => current.value === props.tool)
const registered = useRegisteredTool(() => props.tool)
/** The registered tool by this id, for the name and icon core has none for. */
const own = computed(() =>
  withHostTools([
    ...(ctx.hostTools.value ?? []),
    ...(ctx.pluginHost.value?.tools ?? []),
  ]).find((t) => t.id === props.tool)
)
// `label` and the slot win; then the tool's own name, else core's; then the id.
const name = computed(() => props.label ?? toolName(props.tool, own.value))
const icon = computed(() => ICONS[props.tool] ?? own.value?.icon)
// Reka's typed props stop at its own; ARIA and listeners go through a bound object. A tool
// nobody registered leaves the button disabled, hidden from assistive tech and unnamed.
const hostAttrs = useAttrs()
// A function, not a computed: `useAttrs()` is not reactive, so the render reads it afresh.
const bound = () =>
  registered.value
    ? mergeProps(
        {
          'aria-pressed': String(active.value),
          'aria-label': name.value,
          title: name.value,
          onClick: () => setTool(props.tool),
        },
        hostAttrs
      )
    : {
        ...hostAttrs,
        'aria-hidden': 'true' as const,
        disabled: true,
        'aria-pressed': undefined,
        'aria-label': undefined,
        title: undefined,
        onClick: undefined,
      }
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    class="ink-tool-button"
    data-ink-tool-button
    :data-tool="tool"
    :data-state="active ? 'on' : 'off'"
    v-bind="bound()"
  >
    <template v-if="registered">
      <slot :active="active" :label="name"><InkIcon v-if="icon" :icon="icon" /></slot>
    </template>
  </ToolbarButton>
</template>
