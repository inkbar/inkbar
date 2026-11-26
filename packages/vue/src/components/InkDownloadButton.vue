<script setup lang="ts">
/*
 * Saves the open document's file through the browser's download, under its `fileName` or
 * `filename`. Disabled until the document is ready, and while its redaction marks are applied.
 * With changes, that is a copy with them written in; otherwise the file as it was opened. While a download or print writes its copy the button is `aria-busy` and
 * `aria-disabled`, keeping focus, and a press does nothing. A copy that cannot be written
 * reaches InkRoot's `error`, and the reader is told in InkViewport's message box.
 */
import { downloadDocument, fileBusy, redactionBusy } from '@inkbar/core/dom'
import { Download } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useMessages } from '../composables/useMessages'
import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import InkIcon from './InkIcon.vue'

const props = withDefaults(
  defineProps<{ asChild?: boolean; filename?: string | undefined }>(),
  {
    asChild: false,
    filename: undefined,
  }
)
const ctx = useInkContext('InkDownloadButton')
const ready = computed(
  () => ctx.document.value !== null && ctx.status.value.state === 'ready'
)
const busy = useReadable(
  () => (ctx.document.value ? fileBusy(ctx.document.value) : null),
  false
)
/** The document's redaction marks are being applied: its file is about to be replaced. */
const redacting = useReadable(
  () => (ctx.document.value ? redactionBusy(ctx.document.value) : null),
  false
)

function run(): void {
  const doc = ctx.document.value
  if (doc)
    void downloadDocument(
      doc,
      props.filename === undefined ? {} : { filename: props.filename }
    ).catch(ctx.reportFileError)
}
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const messages = useMessages()
const attrs = computed(() => ({
  'aria-label': messages.value.toolbar.download,
  title: messages.value.toolbar.download,
  'aria-busy': String(busy.value),
  // Disabled while it writes, but not `disabled`, so the button keeps focus.
  'aria-disabled': busy.value ? 'true' : undefined,
  onClick: run,
}))
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    :disabled="redacting || (!ready && !busy)"
    class="ink-download"
    data-ink-download
    v-bind="attrs"
  >
    <slot><InkIcon :icon="Download" /></slot>
  </ToolbarButton>
</template>
