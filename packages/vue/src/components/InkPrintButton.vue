<script setup lang="ts">
/*
 * Prints the open document's file with the browser's own PDF viewer (on iOS, in a new
 * tab). Disabled until the document is ready. It prints what InkDownloadButton downloads, is
 * busy while a copy is written as that button is, and reports a failure the same way.
 */
import { fileBusy, printDocument } from '@inkbar/core/dom'
import { Printer } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useMessages } from '../composables/useMessages'
import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import InkIcon from './InkIcon.vue'

withDefaults(defineProps<{ asChild?: boolean }>(), {
  asChild: false,
})
const ctx = useInkContext('InkPrintButton')
const ready = computed(
  () => ctx.document.value !== null && ctx.status.value.state === 'ready'
)
const busy = useReadable(
  () => (ctx.document.value ? fileBusy(ctx.document.value) : null),
  false
)

function run(): void {
  const doc = ctx.document.value
  if (doc)
    void printDocument(doc, { messages: messages.value }).catch(ctx.reportFileError)
}
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const messages = useMessages()
const attrs = computed(() => ({
  'aria-label': messages.value.toolbar.print,
  title: messages.value.toolbar.print,
  'aria-busy': String(busy.value),
  // Disabled while it writes, but not `disabled`, so the button keeps focus.
  'aria-disabled': busy.value ? 'true' : undefined,
  onClick: run,
}))
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    :disabled="!ready && !busy"
    class="ink-print"
    data-ink-print
    v-bind="attrs"
  >
    <slot><InkIcon :icon="Printer" /></slot>
  </ToolbarButton>
</template>
