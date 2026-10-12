<script setup lang="ts">
import { ref } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

defineProps<{
  src: DocumentSource | null
  assets: PdfAssets
  password?: string | undefined
}>()

// Playwright serialises emitted Errors without their own properties, so the host records the
// codes in the DOM where the test can read them.
const codes = ref<string[]>([])
</script>

<template>
  <InkRoot
    :src="src"
    :assets="assets"
    :password="password"
    @error="(e) => codes.push(e.code)"
  >
    <output data-testid="error-codes">{{ codes.join(',') }}</output>
  </InkRoot>
</template>
