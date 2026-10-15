<script setup lang="ts">
import { ChevronRight } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { usePage } from '../composables/usePage'

import InkIcon from './InkIcon.vue'

withDefaults(defineProps<{ asChild?: boolean }>(), { asChild: false })
const { current, count, next } = usePage()
const disabled = computed(() => current.value >= count.value - 1)
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const attrs = {
  'aria-label': 'Next page',
  title: 'Next page',
  onClick: () => next(),
}
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    :disabled="disabled"
    class="ink-next-page"
    data-ink-next-page
    v-bind="attrs"
  >
    <slot><InkIcon :icon="ChevronRight" /></slot>
  </ToolbarButton>
</template>
