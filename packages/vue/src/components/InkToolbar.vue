<script setup lang="ts">
import { ToolbarRoot } from 'reka-ui'
import { computed } from 'vue'

import { hostLabel, useMessages } from '../composables/useMessages'

import type { Label } from '@inkbar/core'

const props = withDefaults(
  defineProps<{ label?: Label | undefined; asChild?: boolean }>(),
  {
    label: undefined,
    asChild: false,
  }
)
const messages = useMessages()
/** The accessible name: `label`, else "Document tools" in the root's words. */
const name = computed(() => hostLabel(messages, props.label, (m) => m.toolbar.label))
</script>

<template>
  <ToolbarRoot
    :as-child="asChild"
    orientation="horizontal"
    v-bind="{ 'aria-label': name }"
    data-ink-toolbar
    class="ink-toolbar"
  >
    <slot />
  </ToolbarRoot>
</template>
