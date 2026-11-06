<script setup lang="ts">
/* Download and print buttons in a toolbar over a document. */
import InkDownloadButton from '../../src/components/InkDownloadButton.vue'
import InkPrintButton from '../../src/components/InkPrintButton.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

defineProps<{ src: DocumentSource; assets: PdfAssets; filename?: string }>()
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1">
    <InkToolbar>
      <InkDownloadButton :filename="filename" />
      <InkPrintButton />
    </InkToolbar>
    <!-- Test-only box: the scroll container needs a bounded height. -->
    <div style="height: 400px; width: 600px"><InkViewport /></div>
  </InkRoot>
</template>
