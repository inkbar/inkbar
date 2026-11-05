<script setup lang="ts">
import { allTools } from '@inkbar/core/dom'

import InkRoot from '../../src/components/InkRoot.vue'
import InkTextStyleMenu from '../../src/components/InkTextStyleMenu.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import { useHostTrigger } from './host-trigger'
import TextStyleControls from './TextStyleControls.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

const props = defineProps<{
  src: DocumentSource
  assets: PdfAssets
  fonts?: string[]
  hostDisabled?: 'true' | 'false'
}>()
const host = useHostTrigger(() => props.hostDisabled)
const tools = allTools()
</script>

<template>
  <InkRoot
    :src="props.src"
    :assets="props.assets"
    :zoom="1"
    :fonts="props.fonts"
    :tools="tools"
  >
    <InkToolbar><InkTextStyleMenu v-bind="host.attrs.value" /></InkToolbar>
    <div style="height: 600px; width: 900px"><InkViewport /></div>
    <TextStyleControls />
    <div
      data-testid="host"
      :data-keys="host.seen.keys.join(',')"
      :data-clicks="host.seen.clicks"
    />
  </InkRoot>
</template>
