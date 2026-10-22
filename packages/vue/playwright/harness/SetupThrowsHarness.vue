<script setup lang="ts">
import { definePlugin } from '@inkbar/core/dom'
import { onErrorCaptured, ref } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

defineProps<{ src: DocumentSource; assets: PdfAssets }>()

const plugins = [
  definePlugin({
    id: 'sandbox',
    setup() {
      throw new Error('setup failed')
    },
  }),
]
const error = ref('')
onErrorCaptured((e) => {
  error.value = e.message
  return false
})
</script>

<template>
  <div data-testid="harness" :data-error="error">
    <InkRoot :src="src" :assets="assets" :plugins="plugins" />
  </div>
</template>
