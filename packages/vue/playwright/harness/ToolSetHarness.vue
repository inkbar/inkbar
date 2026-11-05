<script setup lang="ts">
import { allTools } from '@inkbar/core/dom'
import { ref } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'
import type { ToolId } from '@inkbar/core/dom'

const props = defineProps<{
  src: DocumentSource
  assets: PdfAssets
  tool: ToolId
  /** Passes no creation tools. */
  bare?: boolean
  /** Follows `update:tool` with v-model; without it the host keeps passing `tool` as given. */
  follow?: boolean
}>()
const emit = defineEmits<{ 'update:tool': [t: ToolId] }>()
const current = ref(props.tool)
const tools = allTools()

function onTool(t: ToolId): void {
  if (props.follow) current.value = t
  emit('update:tool', t)
}
</script>

<template>
  <InkRoot
    :src="src"
    :assets="assets"
    :zoom="1"
    :tool="follow ? current : tool"
    :tools="bare ? [] : tools"
    @update:tool="onTool"
  >
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 600px; width: 900px"><InkViewport /></div>
  </InkRoot>
</template>
