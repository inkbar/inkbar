<script setup lang="ts">
/*
 * Two hundred pages, and no creation tools. The viewer renders only the pages near the
 * viewport, but search reads every page's text, so the find bar counts every hit and steps to
 * any of them. Find opens the bar, as does Ctrl+F or Cmd+F. The Results panel lists every hit
 * and follows the bar. useSearch gives the same state the bar shows, for a control of your own.
 */
import { Search } from '@inkbar/icons'
import {
  InkFindBar,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPanel,
  InkPrevPage,
  InkRoot,
  InkSearchButton,
  InkSearchResults,
  InkSidebar,
  InkIcon,
  InkToolbar,
  InkToolbarButton,
  InkToolButton,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
  useSearch,
} from '@inkbar/vue'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'
import { defineComponent, watch } from 'vue'

import { FileUp } from '../../shared/file-up'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

const { source, log, onDocument, openFile } = defineProps<ScenarioProps>()

/**
 * Logs each finished search and each step to a hit, while the find bar is open. It sits inside
 * InkRoot to reach search.
 */
const SearchLog = defineComponent(() => {
  const { state } = useSearch()
  watch(
    [
      () => state.value.open,
      () => state.value.query,
      () => state.value.hits.length,
      () => state.value.current,
      () => state.value.scanning,
    ],
    ([open, query, hits, current, scanning]) => {
      if (open && query && !scanning) log('search', { query, hits, current })
    }
  )
  return () => null
})

function onReady(doc: InkDocument): void {
  log('@ready', { pages: doc.pages.length })
  onDocument(doc)
}
</script>

<template>
  <InkRoot :src="source" :assets="assets" class="scenario-root" @ready="onReady">
    <InkToolbar class="scenario-toolbar">
      <div class="scenario-group" role="group" aria-label="Tools">
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
      </div>
      <InkSearchButton />
      <div class="scenario-group scenario-file" role="group" aria-label="File">
        <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" @click="openFile">
          <InkIcon :icon="FileUp" />
          Open
        </InkToolbarButton>
      </div>
    </InkToolbar>
    <div class="scenario-body">
      <InkViewport />
      <InkSidebar side="right" layout="tabs">
        <InkPanel id="results" label="Results" :icon="Search">
          <InkSearchResults :field="false" />
        </InkPanel>
      </InkSidebar>
    </div>
    <InkFindBar />
    <InkToolbar label="Page and zoom" class="scenario-status-bar">
      <div class="scenario-group" role="group" aria-label="Page">
        <InkPrevPage />
        <InkPageInput />
        <InkPageCount />
        <InkNextPage />
      </div>
      <div class="scenario-group scenario-zoom" role="group" aria-label="Zoom">
        <InkZoomOut />
        <InkZoomSelect />
        <InkZoomIn />
      </div>
    </InkToolbar>
    <SearchLog />
  </InkRoot>
</template>
