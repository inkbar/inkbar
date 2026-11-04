<script setup lang="ts">
import { highlightTool } from '@inkbar/core/dom'

import InkHighlightMenu from '../../src/components/InkHighlightMenu.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkShapeMenu from '../../src/components/InkShapeMenu.vue'
import InkSignatureMenu from '../../src/components/InkSignatureMenu.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkToolButton from '../../src/components/InkToolButton.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import ComposableProbe from './ComposableProbe.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

/** A viewer with no `tools` (or only `highlight`), showing only the controls a test names. */
defineProps<{
  src: DocumentSource
  assets: PdfAssets
  controls: (
    'highlight-button' | 'hostile-button' | 'highlight' | 'shape' | 'signature'
  )[]
  /** Passes the highlight tool. */
  highlight?: boolean
}>()
const tools = [highlightTool()]
// Fallthrough attributes the button must ignore when its tool is missing.
const hostile: Record<string, string> = { 'aria-label': 'X', title: 'Hostile' }
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1" :tools="highlight ? tools : undefined">
    <InkToolbar>
      <InkToolButton tool="select-text" />
      <InkToolButton v-if="controls.includes('highlight-button')" tool="highlight" />
      <InkToolButton
        v-if="controls.includes('hostile-button')"
        tool="highlight"
        v-bind="hostile"
        ><span>child</span></InkToolButton
      >
      <InkHighlightMenu v-if="controls.includes('highlight')" />
      <InkShapeMenu v-if="controls.includes('shape')" />
      <InkSignatureMenu v-if="controls.includes('signature')" />
    </InkToolbar>
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 600px; width: 900px"><InkViewport /></div>
    <ComposableProbe />
  </InkRoot>
</template>
