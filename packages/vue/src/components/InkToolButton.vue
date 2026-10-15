<script setup lang="ts">
import { TOOL_LABELS } from '@inkbar/core/dom'
import { Hand, Highlighter, MessageSquare, MousePointer2, Square } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useTool } from '../composables/useTool'

import InkIcon from './InkIcon.vue'

import type { ToolId } from '@inkbar/core/dom'
import type { IconNode } from '@inkbar/icons'

const ICONS: Readonly<Record<ToolId, IconNode>> = {
  view: Hand,
  select: MousePointer2,
  highlight: Highlighter,
  'redact-area': Square,
  note: MessageSquare,
}

const props = withDefaults(
  defineProps<{ tool: ToolId; label?: string | undefined; asChild?: boolean }>(),
  { label: undefined, asChild: false }
)

const { tool: current, setTool } = useTool()
const active = computed(() => current.value === props.tool)
const name = computed(() => props.label ?? TOOL_LABELS[props.tool])
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
    <slot :active="active" :label="name"><InkIcon :icon="ICONS[tool]" /></slot>
  </ToolbarButton>
</template>
