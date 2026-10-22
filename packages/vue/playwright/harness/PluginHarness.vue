<script setup lang="ts">
import { ref } from 'vue'

import { createTestPlugin } from '../../../core/src/dom/plugins/test-plugin'
import InkRoot from '../../src/components/InkRoot.vue'

import PluginControls from './PluginControls.vue'

import type { Annotation, DocumentSource, PdfAssets } from '@inkbar/core'

defineProps<{
  src: DocumentSource
  assets: PdfAssets
  /** Owns the annotations through v-model. */
  controlled?: boolean
  history?: boolean
}>()

// Plugins hold functions, which a component test cannot pass as props: the harness builds it.
// Its teardown log outlives the component on `window`, where a test reads it after unmounting.
const log: string[] = []
;(window as Window & { pluginLog?: string[] }).pluginLog = log
const { plugin, marks, finish } = createTestPlugin({ log })
const plugins = [plugin]
const list = ref<Annotation[]>([])
</script>

<template>
  <InkRoot
    v-if="controlled"
    v-model:annotations="list"
    :src="src"
    :assets="assets"
    :history="history"
    :plugins="plugins"
  >
    <PluginControls :marks="marks" @finish="finish" />
    <output data-testid="host-count">{{ list.length }}</output>
  </InkRoot>
  <InkRoot v-else :src="src" :assets="assets" :plugins="plugins">
    <PluginControls :marks="marks" @finish="finish" />
  </InkRoot>
</template>
