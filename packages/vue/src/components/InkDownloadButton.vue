<script setup lang="ts">
/*
 * Saves the open document's file through the browser's download, under its `fileName` or
 * `filename`. Disabled until the document is ready. Today that is the file as it was
 * opened, without this session's annotations.
 */
import { downloadDocument } from '@inkbar/core/dom'
import { Download } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useMessages } from '../composables/useMessages'
import { useInkContext } from '../context'

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

function run(): void {
  const doc = ctx.document.value
  if (doc)
    void downloadDocument(
      doc,
      props.filename === undefined ? {} : { filename: props.filename }
    ).catch(() => undefined)
}
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const messages = useMessages()
const attrs = computed(() => ({
  'aria-label': messages.value.toolbar.download,
  title: messages.value.toolbar.download,
  onClick: run,
}))
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    :disabled="!ready"
    class="ink-download"
    data-ink-download
    v-bind="attrs"
  >
    <slot><InkIcon :icon="Download" /></slot>
  </ToolbarButton>
</template>
