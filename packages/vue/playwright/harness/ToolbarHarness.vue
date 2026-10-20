<script setup lang="ts">
import InkLineStyleMenu from '../../src/components/InkLineStyleMenu.vue'
import InkNextPage from '../../src/components/InkNextPage.vue'
import InkPageCount from '../../src/components/InkPageCount.vue'
import InkPageInput from '../../src/components/InkPageInput.vue'
import InkPrevPage from '../../src/components/InkPrevPage.vue'
import InkRedo from '../../src/components/InkRedo.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkToolbarSeparator from '../../src/components/InkToolbarSeparator.vue'
import InkToolButton from '../../src/components/InkToolButton.vue'
import InkUndo from '../../src/components/InkUndo.vue'
import InkViewport from '../../src/components/InkViewport.vue'
import InkZoomIn from '../../src/components/InkZoomIn.vue'
import InkZoomOut from '../../src/components/InkZoomOut.vue'
import InkZoomSelect from '../../src/components/InkZoomSelect.vue'

import ComposableProbe from './ComposableProbe.vue'

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
    <InkToolbar>
      <InkToolButton tool="select-text" />
      <InkToolButton tool="select" />
      <InkToolButton tool="highlight" />
      <InkToolButton tool="redact-area" />
      <InkToolButton tool="note" />
      <InkToolbarSeparator />
      <InkLineStyleMenu />
      <InkUndo />
      <InkRedo />
    </InkToolbar>
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 600px; width: 900px"><InkViewport /></div>
    <InkToolbar label="Page and zoom">
      <InkPrevPage />
      <InkPageInput />
      <InkPageCount />
      <InkNextPage />
      <InkZoomOut />
      <InkZoomSelect />
      <InkZoomIn />
    </InkToolbar>
    <ComposableProbe />
  </InkRoot>
</template>
