<script setup lang="ts">
/*
 * Download and print buttons in a toolbar over a document. `engine` gives the root a stand-in
 * engine (`held-engine.ts`): `held` through core's engine factory, `unavailable` as a loader that fails; the codes of the errors the root emits show in `errors`.
 */
import { onUnmounted, ref } from 'vue'

import InkDownloadButton from '../../src/components/InkDownloadButton.vue'
import InkPrintButton from '../../src/components/InkPrintButton.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import { heldEngine, holdEngine } from './held-engine'

import type { DocumentSource, InkError, PdfAssets } from '@inkbar/core'

const props = defineProps<{
  src: DocumentSource
  assets: PdfAssets
  filename?: string
  engine?: 'held' | 'unavailable'
}>()
// `held` is core's engine factory, which the root's document uses with no `engine` option;
// `unavailable` is a loader that fails.
const loader = props.engine === 'unavailable' ? heldEngine(true) : undefined
if (props.engine === 'held') onUnmounted(holdEngine())
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
