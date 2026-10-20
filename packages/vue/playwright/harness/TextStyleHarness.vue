<script setup lang="ts">
import InkRoot from '../../src/components/InkRoot.vue'
import InkTextStyleMenu from '../../src/components/InkTextStyleMenu.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import TextStyleControls from './TextStyleControls.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

defineProps<{ src: DocumentSource; assets: PdfAssets; fonts?: string[] }>()
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1" :fonts="fonts">
    <InkToolbar><InkTextStyleMenu /></InkToolbar>
    <div style="height: 600px; width: 900px"><InkViewport /></div>
    <TextStyleControls />
  </InkRoot>
</template>
