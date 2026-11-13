<script setup lang="ts">
import { allTools } from '@inkbar/core/dom'

import InkNextPage from '../../src/components/InkNextPage.vue'
import InkPrevPage from '../../src/components/InkPrevPage.vue'
import InkRedo from '../../src/components/InkRedo.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkSearchButton from '../../src/components/InkSearchButton.vue'
import InkShapeMenu from '../../src/components/InkShapeMenu.vue'
import InkThreadPopover from '../../src/components/InkThreadPopover.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkToolButton from '../../src/components/InkToolButton.vue'
import InkUndo from '../../src/components/InkUndo.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import type { DocumentSource, InkMessagesInput, PdfAssets } from '@inkbar/core'

defineProps<{
  src: DocumentSource
  assets: PdfAssets
  messages?: InkMessagesInput | undefined
  locale?: string | undefined
}>()
const tools = allTools()

type WordWindow = Window & { __inkDrawWord?: string }
/** A host label that reads its own language, which the test changes before new messages. */
const drawLabel = () => (window as WordWindow).__inkDrawWord ?? 'Pen'
</script>

<template>
  <InkRoot
    :src="src"
    :assets="assets"
    :zoom="1"
    :tools="tools"
    :messages="messages"
    :locale="locale"
  >
    <InkToolbar>
      <InkSearchButton />
      <InkUndo />
      <InkRedo />
      <InkPrevPage />
      <InkNextPage />
      <InkShapeMenu />
      <InkToolButton tool="draw" :label="drawLabel" />
    </InkToolbar>
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 600px; width: 900px"><InkViewport /></div>
    <InkThreadPopover />
  </InkRoot>
</template>
