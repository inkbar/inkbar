<script setup lang="ts">
/* A record list of the suggestions plugin beside the viewport, with undo and a hooks probe. */
import { ref } from 'vue'

import InkRecordList from '../../src/components/InkRecordList.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkUndo from '../../src/components/InkUndo.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import RecordsProbe from './RecordsProbe.vue'
import { suggestions, suggestionsPlugin } from './suggestions-plugin'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

const props = defineProps<{
  src: DocumentSource | null
  assets: PdfAssets
  /** How many open suggestions the document starts with. */
  initial: number
  /** Render the `#empty` slot. */
  customEmpty?: boolean
}>()

// Plugins hold functions, which a component test cannot pass as props: the harness builds it.
const plugins = [suggestionsPlugin({ initial: suggestions(props.initial) })]
const count = ref<number | null>(null)
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1" :plugins="plugins">
    <InkToolbar><InkUndo /></InkToolbar>
    <output data-testid="count">{{ count ?? 'none' }}</output>
    <RecordsProbe />
    <div style="display: flex">
      <!-- Test-only box: the list fills its parent's height. -->
      <div style="height: 300px; width: 280px; display: flex; flex-direction: column">
        <InkRecordList
          records="sandbox.suggestions"
          data-testid="list"
          @update:count="count = $event"
        >
          <template v-if="customEmpty" #empty>
            <span data-testid="custom-empty">All caught up</span>
          </template>
        </InkRecordList>
      </div>
      <div style="height: 450px; width: 600px"><InkViewport /></div>
    </div>
  </InkRoot>
</template>
