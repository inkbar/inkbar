<script setup lang="ts">
import InkLineStyleMenu from '../../src/components/InkLineStyleMenu.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import LineStyleControls from './LineStyleControls.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

defineProps<{ src: DocumentSource; assets: PdfAssets }>()
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1">
    <InkToolbar><InkLineStyleMenu /></InkToolbar>
    <div style="height: 600px; width: 900px"><InkViewport /></div>
    <LineStyleControls />
  </InkRoot>
</template>
