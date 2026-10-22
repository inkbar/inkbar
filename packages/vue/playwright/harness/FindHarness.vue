<script setup lang="ts">
import InkFindBar from '../../src/components/InkFindBar.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkSearchButton from '../../src/components/InkSearchButton.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import SearchProbe from './SearchProbe.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

withDefaults(
  defineProps<{ src: DocumentSource | null; assets: PdfAssets; withBar?: boolean }>(),
  { withBar: true }
)
</script>

<template>
  <button type="button" data-testid="outside">Outside</button>
  <InkRoot :src="src" :assets="assets" :zoom="1">
    <InkToolbar><InkSearchButton /></InkToolbar>
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 600px; width: 900px"><InkViewport /></div>
    <InkFindBar v-if="withBar" />
    <SearchProbe />
  </InkRoot>
</template>
