<script setup lang="ts">
import InkLineStyleMenu from '../../src/components/InkLineStyleMenu.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import { useHostTrigger } from './host-trigger'
import LineStyleControls from './LineStyleControls.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

const props = defineProps<{
  src: DocumentSource
  assets: PdfAssets
  hostDisabled?: 'true' | 'false'
}>()
const host = useHostTrigger(() => props.hostDisabled)
</script>

<template>
  <InkRoot :src="props.src" :assets="props.assets" :zoom="1">
    <InkToolbar><InkLineStyleMenu v-bind="host.attrs.value" /></InkToolbar>
    <div style="height: 600px; width: 900px"><InkViewport /></div>
    <LineStyleControls />
    <div
      data-testid="host"
      :data-keys="host.seen.keys.join(',')"
      :data-clicks="host.seen.clicks"
    />
  </InkRoot>
</template>
