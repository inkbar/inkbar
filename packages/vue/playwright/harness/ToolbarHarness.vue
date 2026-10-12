<script setup lang="ts">
import InkRoot from '../../src/components/InkRoot.vue'
import InkViewport from '../../src/components/InkViewport.vue'
import DefaultToolbar from '../../src/compositions/DefaultToolbar.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'
import type { ToolId } from '@inkbar/core/dom'

defineProps<{ src: DocumentSource; assets: PdfAssets }>()
const emit = defineEmits<{ 'update:tool': [t: ToolId] }>()
</script>

<template>
  <InkRoot
    :src="src"
    :assets="assets"
    :zoom="1"
    @update:tool="emit('update:tool', $event)"
  >
    <DefaultToolbar />
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 600px; width: 900px"><InkViewport /></div>
  </InkRoot>
</template>
