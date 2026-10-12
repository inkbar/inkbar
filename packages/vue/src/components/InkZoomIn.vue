<script setup lang="ts">
import { ToolbarButton } from 'reka-ui'

import { useZoom } from '../composables/useZoom'

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
    <slot>+</slot>
  </ToolbarButton>
</template>
