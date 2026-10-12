<script setup lang="ts">
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useTool } from '../composables/useTool'

import type { ToolId } from '@inkbar/core/dom'

const props = withDefaults(
  defineProps<{ tool: ToolId; label?: string | undefined; asChild?: boolean }>(),
  { label: undefined, asChild: false }
)

const LABELS: Record<ToolId, string> = {
  view: 'View',
  select: 'Select',
  highlight: 'Highlight',
  'redact-area': 'Mark for redaction',
  note: 'Add note',
}

const { tool: current, setTool } = useTool()
const active = computed(() => current.value === props.tool)
const name = computed(() => props.label ?? LABELS[props.tool])
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
    <slot :active="active" :label="name">{{ name }}</slot>
  </ToolbarButton>
</template>
