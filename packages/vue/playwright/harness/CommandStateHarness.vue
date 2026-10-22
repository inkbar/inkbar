<script setup lang="ts">
import { writable } from '@inkbar/core'
import { definePlugin } from '@inkbar/core/dom'
import { onErrorCaptured, ref } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'

import CommandStateProbe from './CommandStateProbe.vue'

import type { PdfAssets } from '@inkbar/core'

defineProps<{ assets: PdfAssets; id: string }>()

// `always` is enabled without a document, so only plugin setup decides when it turns on.
const plugins = [
  definePlugin({
    id: 'sandbox',
    setup(ctx) {
      ctx.commands.add({
        id: 'always',
        label: 'Always',
        enabled: writable(true),
        run: () => undefined,
      })
    },
  }),
]
const error = ref('')
onErrorCaptured((e) => {
  error.value = (e as { code?: string }).code ?? String(e)
  return false
})
</script>

<template>
  <div data-testid="harness" :data-error="error">
    <InkRoot v-if="!error" :src="null" :assets="assets" :plugins="plugins">
      <CommandStateProbe :id="id" />
    </InkRoot>
  </div>
</template>
