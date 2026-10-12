<script setup lang="ts">
import { ToolbarButton } from 'reka-ui'

import { useZoom } from '../composables/useZoom'

withDefaults(defineProps<{ asChild?: boolean }>(), { asChild: false })
const { zoomOut } = useZoom()
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const attrs = {
  'aria-label': 'Zoom out',
  title: 'Zoom out',
  onClick: () => zoomOut(),
}
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    class="ink-zoom-out"
    data-ink-zoom-out
    v-bind="attrs"
  >
    <slot>−</slot>
  </ToolbarButton>
</template>
