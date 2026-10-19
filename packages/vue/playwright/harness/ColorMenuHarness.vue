<script setup lang="ts">
import InkColorMenu from '../../src/components/InkColorMenu.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import ColorMenuControls from './ColorMenuControls.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

defineProps<{ src: DocumentSource; assets: PdfAssets }>()
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1">
    <InkToolbar>
      <InkColorMenu property="border" />
      <InkColorMenu property="fill" />
      <InkColorMenu property="textColor" />
    </InkToolbar>
    <div style="height: 600px; width: 900px"><InkViewport /></div>
    <ColorMenuControls />
  </InkRoot>
</template>
