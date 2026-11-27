<script setup lang="ts">
/*
 * Download and print buttons in a toolbar over a document. `engine` makes the held engine
 * (`held-engine.ts`) the one the root's document uses, through core's engine factory: `held`
 * holds its writes, `unavailable` stops it at its first write with no engine starting after it.
 * The codes of the errors the root emits show in `errors`.
 */
import { onUnmounted, ref } from 'vue'

import InkDownloadButton from '../../src/components/InkDownloadButton.vue'
import InkPrintButton from '../../src/components/InkPrintButton.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import { holdEngine } from './held-engine'

import type { DocumentSource, InkError, PdfAssets } from '@inkbar/core'

const props = defineProps<{
  src: DocumentSource
  assets: PdfAssets
  filename?: string
  engine?: 'held' | 'unavailable'
}>()
if (props.engine) onUnmounted(holdEngine(props.engine === 'unavailable'))
const errors = ref<string[]>([])
const onError = (e: InkError) => errors.value.push(e.code)
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1" @error="onError">
    <InkToolbar>
      <InkDownloadButton :filename="filename" />
      <InkPrintButton />
    </InkToolbar>
    <!-- Test-only box: the scroll container needs a bounded height. -->
    <div style="height: 400px; width: 600px"><InkViewport /></div>
    <output data-testid="errors">{{ errors.join(' ') }}</output>
  </InkRoot>
</template>
