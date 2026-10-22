<script setup lang="ts">
import { TOOL_LABELS } from '@inkbar/core/dom'
import {
  Highlighter,
  MessageSquare,
  PenLine,
  PenTool,
  Signature,
  Square,
  SquareDashedMousePointer,
  TextCursor,
  Type,
} from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useTool } from '../composables/useTool'
import { useInkContext } from '../context'

import InkIcon from './InkIcon.vue'

import type { ToolId } from '@inkbar/core/dom'
import type { IconNode } from '@inkbar/icons'

const ICONS: Readonly<Partial<Record<ToolId, IconNode>>> = {
  'select-text': TextCursor,
  select: SquareDashedMousePointer,
  highlight: Highlighter,
  'redact-area': Square,
  sketch: PenTool,
  draw: PenLine,
  note: MessageSquare,
  freetext: Type,
  signature: Signature,
}

const props = withDefaults(
  defineProps<{ tool: ToolId; label?: string | undefined; asChild?: boolean }>(),
  { label: undefined, asChild: false }
)

const ctx = useInkContext('InkToolButton')
const { tool: current, setTool } = useTool()
const active = computed(() => current.value === props.tool)
/** A host or plugin tool by this id, for the name and icon core has none for. */
const own = computed(() =>
  [...(ctx.hostTools.value ?? []), ...(ctx.pluginHost.value?.tools ?? [])].find(
    (t) => t.id === props.tool
  )
)
// `label` and the slot win; then core's name and icon; then the tool's own.
const name = computed(
  () => props.label ?? TOOL_LABELS[props.tool] ?? own.value?.label ?? props.tool
)
const icon = computed(() => ICONS[props.tool] ?? own.value?.icon)
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const attrs = computed(() => ({
  'aria-pressed': String(active.value),
  'aria-label': name.value,
  title: name.value,
  onClick: () => setTool(props.tool),
}))
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    class="ink-tool-button"
    data-ink-tool-button
    :data-tool="tool"
    :data-state="active ? 'on' : 'off'"
    v-bind="attrs"
  >
    <slot :active="active" :label="name"><InkIcon v-if="icon" :icon="icon" /></slot>
  </ToolbarButton>
</template>
