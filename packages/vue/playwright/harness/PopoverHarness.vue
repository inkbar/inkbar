<script setup lang="ts">
import InkNotePopover from '../../src/components/InkNotePopover.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkSuggestionCard from '../../src/components/InkSuggestionCard.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import type { DocumentSource, InkDocument, PdfAssets } from '@inkbar/core'

const props = defineProps<{
  src: DocumentSource
  assets: PdfAssets
  seedSuggestions?: boolean | undefined
}>()

function onReady(doc: InkDocument) {
  if (!props.seedSuggestions) return
  doc.annotations.add({
    type: 'redact',
    page: 0,
    rect: { x: 72, y: 670, width: 150, height: 20 },
    origin: 'suggested',
    suggestion: {
      confidence: 0.92,
      reason: 'third-party name',
      explanation: 'Names a person other than the data subject.',
    },
  })
  doc.annotations.add({
    type: 'redact',
    page: 0,
    rect: { x: 72, y: 640, width: 150, height: 20 },
    origin: 'suggested',
    suggestion: { confidence: 0.3, reason: 'possible email' },
  })
}
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1" @ready="onReady">
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 600px; width: 900px"><InkViewport /></div>
    <InkNotePopover />
    <InkSuggestionCard />
  </InkRoot>
</template>
