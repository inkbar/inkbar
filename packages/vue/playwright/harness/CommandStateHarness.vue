<script setup lang="ts">
import { writable } from '@inkbar/core'
import { definePlugin } from '@inkbar/core/dom'

import InkRoot from '../../src/components/InkRoot.vue'

import CommandStateProbe from './CommandStateProbe.vue'

import type { PdfAssets } from '@inkbar/core'

withDefaults(defineProps<{ assets: PdfAssets; id: string; src?: string | null }>(), {
  src: null,
})

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
</script>

<template>
  <InkRoot :src="src" :assets="assets" :plugins="plugins">
    <CommandStateProbe :id="id" />
  </InkRoot>
</template>
