<script setup lang="ts">
import { ZoomIn } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useMessages } from '../composables/useMessages'
import { useZoom } from '../composables/useZoom'

import InkIcon from './InkIcon.vue'

withDefaults(defineProps<{ asChild?: boolean }>(), { asChild: false })
const { zoomIn } = useZoom()
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const messages = useMessages()
const attrs = computed(() => ({
  'aria-label': messages.value.toolbar.zoomIn,
  title: messages.value.toolbar.zoomIn,
  onClick: () => zoomIn(),
}))
</script>

<template>
  <ToolbarButton :as-child="asChild" class="ink-zoom-in" data-ink-zoom-in v-bind="attrs">
    <slot><InkIcon :icon="ZoomIn" /></slot>
  </ToolbarButton>
</template>
