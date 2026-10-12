<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

const props = defineProps<{
  src: DocumentSource | null
  assets: PdfAssets
  password?: string | undefined
  /** Fetches this URL in the page and passes the bytes as the source, one array for every open. */
  bytesFrom?: string | undefined
}>()

// Playwright serialises emitted Errors without their own properties, so the host records the
// codes in the DOM where the test can read them.
const codes = ref<string[]>([])
const bytes = shallowRef<Uint8Array | null>(null)
const byteLength = ref<number | null>(null)

onMounted(async () => {
  if (props.bytesFrom === undefined) return
  const res = await fetch(props.bytesFrom)
  bytes.value = new Uint8Array(await res.arrayBuffer())
})

function onError(code: string): void {
  codes.value.push(code)
  byteLength.value = bytes.value?.byteLength ?? null
}

function onReady(): void {
  byteLength.value = bytes.value?.byteLength ?? null
}
</script>

<template>
  <InkRoot
    :src="bytesFrom === undefined ? src : bytes"
    :assets="assets"
    :password="password"
    @error="(e) => onError(e.code)"
    @ready="onReady"
  >
    <output data-testid="error-codes">{{ codes.join(',') }}</output>
    <output data-testid="byte-length">{{ byteLength ?? '' }}</output>
  </InkRoot>
</template>
