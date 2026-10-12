<script setup lang="ts">
import { ref } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'

import ComposableProbe from './ComposableProbe.vue'

import type { Annotation, PdfAssets } from '@inkbar/core'

defineProps<{ src: string; assets: PdfAssets; history?: boolean }>()

/** A host that owns the list through v-model, the way an app would. */
const list = ref<Annotation[]>([])
</script>

<template>
  <InkRoot v-model:annotations="list" :src="src" :assets="assets" :history="history">
    <ComposableProbe />
    <output data-testid="host-count">{{ list.length }}</output>
  </InkRoot>
</template>
