<script setup lang="ts">
import InkColorMenu from '../../src/components/InkColorMenu.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import ColorMenuControls from './ColorMenuControls.vue'
import { useHostTrigger } from './host-trigger'

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
    <InkToolbar>
      <InkColorMenu property="border" v-bind="host.attrs.value" />
      <InkColorMenu property="fill" />
      <InkColorMenu property="textColor" />
    </InkToolbar>
    <div style="height: 600px; width: 900px"><InkViewport /></div>
    <ColorMenuControls />
    <div
      data-testid="host"
      :data-keys="host.seen.keys.join(',')"
      :data-clicks="host.seen.clicks"
    />
  </InkRoot>
</template>
