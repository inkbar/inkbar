<script setup lang="ts">
import { ArrowRight } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'

import { injectInkContext } from '../context'
import { useReadable } from '../use-readable'

import InkIcon from './InkIcon.vue'

withDefaults(defineProps<{ asChild?: boolean }>(), { asChild: false })
const ctx = injectInkContext()
// Goes forward again after Back; disabled until Back is used.
const canGoForward = useReadable<boolean>(
  () => ctx.navigation.value?.canGoForward ?? null,
  false
)
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const attrs = {
  'aria-label': 'Forward',
  title: 'Forward',
  onClick: () => ctx.navigation.value?.forward(),
}
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    :disabled="!canGoForward"
    class="ink-forward"
    data-ink-forward
    v-bind="attrs"
  >
    <slot><InkIcon :icon="ArrowRight" /></slot>
  </ToolbarButton>
</template>
