<script setup lang="ts">
import { Redo2 } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'

import { useHistory } from '../composables/useHistory'

import InkIcon from './InkIcon.vue'

withDefaults(defineProps<{ asChild?: boolean }>(), { asChild: false })
const { canRedo, redo } = useHistory()
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const attrs = {
  'aria-label': 'Redo',
  title: 'Redo',
  onClick: () => redo(),
}
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    :disabled="!canRedo"
    class="ink-redo"
    data-ink-redo
    v-bind="attrs"
  >
    <slot><InkIcon :icon="Redo2" /></slot>
  </ToolbarButton>
</template>
