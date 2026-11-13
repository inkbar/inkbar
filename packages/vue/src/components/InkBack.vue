<script setup lang="ts">
import { ArrowLeft } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useMessages } from '../composables/useMessages'
import { injectInkContext } from '../context'
import { useReadable } from '../use-readable'

import InkIcon from './InkIcon.vue'

withDefaults(defineProps<{ asChild?: boolean }>(), { asChild: false })
const ctx = injectInkContext()
// Returns to where the view was before the last jump; disabled while there is nowhere to go.
const canGoBack = useReadable<boolean>(
  () => ctx.navigation.value?.canGoBack ?? null,
  false
)
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const messages = useMessages()
const attrs = computed(() => ({
  'aria-label': messages.value.toolbar.back,
  title: messages.value.toolbar.back,
  onClick: () => ctx.navigation.value?.back(),
}))
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    :disabled="!canGoBack"
    class="ink-back"
    data-ink-back
    v-bind="attrs"
  >
    <slot><InkIcon :icon="ArrowLeft" /></slot>
  </ToolbarButton>
</template>
