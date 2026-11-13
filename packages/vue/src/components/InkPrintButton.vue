<script setup lang="ts">
/*
 * Prints the open document's file with the browser's own PDF viewer (on iOS, in a new
 * tab). Disabled until the document is ready. Today that is the file as it was
 * opened, without this session's annotations.
 */
import { printDocument } from '@inkbar/core/dom'
import { Printer } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useMessages } from '../composables/useMessages'
import { useInkContext } from '../context'

import InkIcon from './InkIcon.vue'

withDefaults(defineProps<{ asChild?: boolean }>(), {
  asChild: false,
})
const ctx = useInkContext('InkPrintButton')
const ready = computed(
  () => ctx.document.value !== null && ctx.status.value.state === 'ready'
)

function run(): void {
  const doc = ctx.document.value
  if (doc) void printDocument(doc).catch(() => undefined)
}
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const messages = useMessages()
const attrs = computed(() => ({
  'aria-label': messages.value.toolbar.print,
  title: messages.value.toolbar.print,
  onClick: run,
}))
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    :disabled="!ready"
    class="ink-print"
    data-ink-print
    v-bind="attrs"
  >
    <slot><InkIcon :icon="Printer" /></slot>
  </ToolbarButton>
</template>
