<script setup lang="ts">
/* An outline panel beside the viewport, with Back and Forward and the current page. */
import InkBack from '../../src/components/InkBack.vue'
import InkForward from '../../src/components/InkForward.vue'
import InkOutline from '../../src/components/InkOutline.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import PageProbe from './PageProbe.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

defineProps<{
  src: DocumentSource | null
  assets: PdfAssets
  emptyText?: string | undefined
  slotted?: boolean
}>()
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1">
    <InkToolbar>
      <InkBack data-testid="back" />
      <InkForward data-testid="forward" />
    </InkToolbar>
    <PageProbe />
    <div style="display: flex">
      <!-- Test-only box: the outline fills its parent's height. -->
      <div style="height: 450px; width: 240px">
        <InkOutline :empty-text="emptyText" data-testid="outline">
          <template v-if="slotted" #item="{ item, current, expanded }">
            <b class="harness-title" :data-current="current" :data-expanded="expanded">
              {{ item.title }}
            </b>
          </template>
        </InkOutline>
      </div>
      <div style="height: 450px; width: 600px"><InkViewport /></div>
    </div>
  </InkRoot>
</template>
