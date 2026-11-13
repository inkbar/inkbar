<script setup lang="ts">
import { ZoomOut } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useMessages } from '../composables/useMessages'
import { useZoom } from '../composables/useZoom'

import InkIcon from './InkIcon.vue'

withDefaults(defineProps<{ asChild?: boolean }>(), { asChild: false })
const { zoomOut } = useZoom()
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const messages = useMessages()
const attrs = computed(() => ({
  'aria-label': messages.value.toolbar.zoomOut,
  title: messages.value.toolbar.zoomOut,
  onClick: () => zoomOut(),
}))
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    class="ink-zoom-out"
    data-ink-zoom-out
    v-bind="attrs"
  >
    <slot><InkIcon :icon="ZoomOut" /></slot>
  </ToolbarButton>
</template>
