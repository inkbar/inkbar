<script setup lang="ts">
import { allTools } from '@inkbar/core/dom'

import InkRoot from '../../src/components/InkRoot.vue'

import ComposableProbe from './ComposableProbe.vue'

import type { PdfAssets } from '@inkbar/core'

defineProps<{ src: string; assets: PdfAssets }>()
const tools = allTools()
</script>

<template>
  <InkRoot :src="src" :assets="assets" :tools="tools">
    <ComposableProbe />
  </InkRoot>
</template>
