<script setup lang="ts">
import InkRoot from '../../src/components/InkRoot.vue'

import ComposableProbe from './ComposableProbe.vue'

import type { PdfAssets } from '@inkbar/core'

defineProps<{ src: string; assets: PdfAssets }>()
</script>

<template>
  <InkRoot :src="src" :assets="assets">
    <ComposableProbe />
  </InkRoot>
</template>
