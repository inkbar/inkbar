<script setup lang="ts">
import { Undo2 } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useHistory } from '../composables/useHistory'
import { useMessages } from '../composables/useMessages'

import InkIcon from './InkIcon.vue'

withDefaults(defineProps<{ asChild?: boolean }>(), { asChild: false })
const { canUndo, undo } = useHistory()
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const messages = useMessages()
const attrs = computed(() => ({
  'aria-label': messages.value.toolbar.undo,
  title: messages.value.toolbar.undo,
  onClick: () => undo(),
}))
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    :disabled="!canUndo"
    class="ink-undo"
    data-ink-undo
    v-bind="attrs"
  >
    <slot><InkIcon :icon="Undo2" /></slot>
  </ToolbarButton>
</template>
