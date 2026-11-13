<script setup lang="ts">
import { ChevronLeft } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useMessages } from '../composables/useMessages'
import { usePage } from '../composables/usePage'

import InkIcon from './InkIcon.vue'

withDefaults(defineProps<{ asChild?: boolean }>(), { asChild: false })
const { current, previous } = usePage()
const disabled = computed(() => current.value <= 0)
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const messages = useMessages()
const attrs = computed(() => ({
  'aria-label': messages.value.toolbar.previousPage,
  title: messages.value.toolbar.previousPage,
  onClick: () => previous(),
}))
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    :disabled="disabled"
    class="ink-prev-page"
    data-ink-prev-page
    v-bind="attrs"
  >
    <slot><InkIcon :icon="ChevronLeft" /></slot>
  </ToolbarButton>
</template>
