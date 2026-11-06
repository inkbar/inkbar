<script setup lang="ts">
/*
 * A thumbnail list beside the viewport, and a dialog holding one thumbnail, as a "Remove pages"
 * dialog would.
 */
import { ref, useTemplateRef } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'
import InkThumbnail from '../../src/components/InkThumbnail.vue'
import InkThumbnails from '../../src/components/InkThumbnails.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import PageProbe from './PageProbe.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

defineProps<{
  src: DocumentSource | null
  assets: PdfAssets
  pages?: number[] | undefined
  width?: number | undefined
}>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const withList = ref(true)
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1">
    <button type="button" data-testid="open-dialog" @click="dialog?.showModal()">
      Remove pages
    </button>
    <button type="button" data-testid="toggle-list" @click="withList = !withList">
      Toggle list
    </button>
    <PageProbe />
    <div style="display: flex">
      <!-- Test-only box: the list fills its parent's height; 152px fits 120px thumbnails. -->
      <div style="height: 600px; width: 152px">
        <InkThumbnails v-if="withList" :pages="pages" :width="width" data-testid="list">
          <template #item="{ page, current }">
            <span class="harness-item" :data-page="page" :data-current="current">
              {{ current ? 'here' : '' }}
            </span>
          </template>
        </InkThumbnails>
      </div>
      <div style="height: 450px; width: 600px"><InkViewport /></div>
    </div>
    <dialog ref="dialog" aria-label="Remove pages">
      <InkThumbnail :page="1" :width="80" data-testid="dialog-thumbnail" />
      <button type="button" @click="dialog?.close()">Close</button>
    </dialog>
  </InkRoot>
</template>
