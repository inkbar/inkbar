<script setup lang="ts">
import { ZoomIn } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'

import { useZoom } from '../composables/useZoom'

import InkIcon from './InkIcon.vue'

withDefaults(defineProps<{ asChild?: boolean }>(), { asChild: false })
const { zoomIn } = useZoom()
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const attrs = {
  'aria-label': 'Zoom in',
  title: 'Zoom in',
  onClick: () => zoomIn(),
}
</script>

<template>
  <ToolbarButton :as-child="asChild" class="ink-zoom-in" data-ink-zoom-in v-bind="attrs">
    <slot><InkIcon :icon="ZoomIn" /></slot>
  </ToolbarButton>
</template>
