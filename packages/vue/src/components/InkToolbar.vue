<script setup lang="ts">
import { ToolbarRoot } from 'reka-ui'

withDefaults(defineProps<{ label?: string; asChild?: boolean }>(), {
  label: 'Document tools',
  asChild: false,
})
</script>

<template>
  <ToolbarRoot
    :as-child="asChild"
    orientation="horizontal"
    v-bind="{ 'aria-label': label }"
    data-ink-toolbar
    class="ink-toolbar"
  >
    <slot />
  </ToolbarRoot>
</template>
