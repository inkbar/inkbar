<script setup lang="ts">
/*
 * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails
 * and Search finds text; About on the right is your own markup. Layout switches both
 * sidebars between a rail, tabs and a stack.
 */
import { Info, Search, Square } from '@inkbar/icons'
import {
  InkDownloadButton,
  InkPrintButton,
  InkIcon,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPanel,
  InkPrevPage,
  InkRoot,
  InkSearchResults,
  InkSidebar,
  InkThumbnails,
  InkToolbar,
  InkToolbarButton,
  InkToolButton,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/vue'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'
import { ref } from 'vue'

import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'
import type { SidebarLayout } from '@inkbar/core/dom'

const { source, messages, locale, labels, log, onDocument, openFile } =
  defineProps<ScenarioProps>()

const layout = ref<SidebarLayout>('rail')

function onReady(doc: InkDocument): void {
  log('@ready', { pages: doc.pages.length })
  onDocument(doc)
}
</script>

<template>
  <InkRoot
    :src="source"
    :messages="messages"
    :locale="locale"
    :assets="assets"
    :storage="storage"
    class="scenario-root"
    @ready="onReady"
  >
    <InkToolbar class="scenario-toolbar">
      <div class="scenario-group" role="group" :aria-label="labels.tools">
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
      </div>
      <label class="scenario-layout">
        {{ labels.layout }}
        <select v-model="layout" class="ink-select">
          <option value="rail">{{ labels.rail }}</option>
          <option value="tabs">{{ labels.tabs }}</option>
          <option value="stack">{{ labels.stack }}</option>
        </select>
      </label>
      <div class="scenario-group scenario-file" role="group" :aria-label="labels.file">
        <InkToolbarButton
          :aria-label="labels.openPdf"
          :title="labels.openPdf"
          @click="openFile"
        >
          <InkIcon :icon="FileUp" />
          {{ labels.open }}
        </InkToolbarButton>
        <InkDownloadButton />
        <InkPrintButton />
      </div>
    </InkToolbar>
    <div class="scenario-body">
      <InkSidebar name="sidebars-left" side="left" :layout="layout">
        <InkPanel id="pages" :label="labels.pages" :icon="Square">
          <InkThumbnails />
        </InkPanel>
        <InkPanel id="search" :label="labels.search" :icon="Search">
          <InkSearchResults />
        </InkPanel>
      </InkSidebar>
      <InkViewport />
      <InkSidebar name="sidebars-right" side="right" :layout="layout">
        <InkPanel id="about" :label="labels.about" :icon="Info">
          <div class="sidebar-about">
            <p>{{ labels.aboutFill }}</p>
            <p>{{ labels.aboutRecords }}</p>
          </div>
        </InkPanel>
      </InkSidebar>
    </div>
    <InkToolbar :label="labels.pageAndZoom" class="scenario-status-bar">
      <div class="scenario-group" role="group" :aria-label="labels.page">
        <InkPrevPage />
        <InkPageInput />
        <InkPageCount />
        <InkNextPage />
      </div>
      <div class="scenario-group scenario-zoom" role="group" :aria-label="labels.zoom">
        <InkZoomOut />
        <InkZoomSelect />
        <InkZoomIn />
      </div>
    </InkToolbar>
  </InkRoot>
</template>
