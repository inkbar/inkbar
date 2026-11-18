<script setup lang="ts">
/*
 * Download and print buttons in a toolbar over a document. `engine` gives the root a stand-in
 * engine (`held-engine.ts`); the codes of the errors the root emits show in `errors`.
 */
import { ref } from 'vue'

import InkDownloadButton from '../../src/components/InkDownloadButton.vue'
import InkPrintButton from '../../src/components/InkPrintButton.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import { heldEngine } from './held-engine'

import type { DocumentSource, InkError, PdfAssets } from '@inkbar/core'

const props = defineProps<{
  src: DocumentSource
  assets: PdfAssets
  filename?: string
  engine?: 'held' | 'unavailable'
}>()
const loader = props.engine ? heldEngine(props.engine === 'unavailable') : undefined
const errors = ref<string[]>([])
const onError = (e: InkError) => errors.value.push(e.code)
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1" :engine="loader" @error="onError">
    <InkToolbar>
      <InkDownloadButton :filename="filename" />
      <InkPrintButton />
    </InkToolbar>
    <!-- Test-only box: the scroll container needs a bounded height. -->
    <div style="height: 400px; width: 600px"><InkViewport /></div>
    <output data-testid="errors">{{ errors.join(' ') }}</output>
  </InkRoot>
</template>
