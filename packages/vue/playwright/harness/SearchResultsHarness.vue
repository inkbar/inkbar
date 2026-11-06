<script setup lang="ts">
/* Search results in a side box, with the find bar over the viewport. */
import InkFindBar from '../../src/components/InkFindBar.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkSearchButton from '../../src/components/InkSearchButton.vue'
import InkSearchResults from '../../src/components/InkSearchResults.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

withDefaults(
  defineProps<{ src: DocumentSource | null; assets: PdfAssets; field?: boolean }>(),
  { field: true }
)
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1">
    <InkToolbar><InkSearchButton /></InkToolbar>
    <div style="display: flex">
      <!-- Test-only box: the list fills its parent's height. -->
      <div style="height: 300px; width: 280px; display: flex; flex-direction: column">
        <InkSearchResults :field="field" data-testid="results" />
      </div>
      <div style="height: 450px; width: 600px"><InkViewport /></div>
    </div>
    <InkFindBar data-testid="find-bar" />
  </InkRoot>
</template>
