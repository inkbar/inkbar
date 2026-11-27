<script setup lang="ts">
/*
 * Suggest redactions is a plugin (src/plugin/suggestions.ts). Register it in `plugins` and place
 * its command where you want with InkCommand. Suggest adds the plugin's own records, draws a mark
 * on each and opens a card when you press one. Accept turns a suggestion into a redaction.
 * Thumbnails of the pages sit in the left sidebar; ReviewSidebar, beside this file, is the right.
 */
import { allTools, type SidebarOpen } from '@inkbar/core/dom'
import { Square } from '@inkbar/icons'
import {
  InkApplyRedactions,
  InkDownloadButton,
  InkPrintButton,
  InkColorMenu,
  InkCommand,
  InkHighlightMenu,
  InkLineStyleMenu,
  InkNextPage,
  InkPageCount,
  InkPanel,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkShapeMenu,
  InkSidebar,
  InkSignatureMenu,
  InkTextStyleMenu,
  InkThreadPopover,
  InkThumbnails,
  InkIcon,
  InkToolbar,
  InkToolbarButton,
  InkToolbarSeparator,
  InkToolButton,
  InkUndo,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
  useCommand,
} from '@inkbar/vue'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'
import { defineComponent, ref, watch } from 'vue'

import { suggestionsPlugin } from '../../plugin/suggestions'
import '../../plugin/suggestions.css'
import { FileUp } from '../../shared/file-up'
import { signatureFonts, storage } from '../../shared/signatures'

import ReviewSidebar from './ReviewSidebar.vue'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

const { source, messages, locale, labels, log, onDocument, openFile } =
  defineProps<ScenarioProps>()

const tools = allTools()
// The plugin reads its words when it shows them, so they follow the language.
const plugins = [suggestionsPlugin({ text: () => labels.plugin })]

/** The Pages panel starts closed, leaving the pages the room. */
const pagesOpen = ref<SidebarOpen | undefined>(null)

/** Logs each result of the Suggest command. It sits inside InkRoot to reach the command. */
const CommandLog = defineComponent(() => {
  const { status } = useCommand('sandbox.suggest')
  watch(status, (text) => {
    if (text) log('command', text)
  })
  return () => null
})

function onReady(doc: InkDocument): void {
  log('@ready', { pages: doc.pages.length })
  onDocument(doc)
}

function onActivate(id: string): void {
  log('@activate', id)
}
</script>

<template>
  <InkRoot
    :src="source"
    :messages="messages"
    :locale="locale"
    :assets="assets"
    :tools="tools"
    :plugins="plugins"
    :storage="storage"
    :signature-fonts="signatureFonts"
    class="scenario-root"
    @ready="onReady"
    @activate="onActivate"
  >
    <InkToolbar class="scenario-toolbar">
      <InkHighlightMenu />
      <div class="scenario-group" role="group" :aria-label="labels.tools">
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
        <InkToolButton tool="redact-area" />
        <InkApplyRedactions />
        <InkToolButton tool="sketch" />
        <InkToolButton tool="draw" />
        <InkShapeMenu />
        <InkToolButton tool="freetext" />
        <InkSignatureMenu />
        <InkToolButton tool="note" />
      </div>
      <InkToolbarSeparator />
      <div class="scenario-group" role="group" :aria-label="labels.style">
        <InkLineStyleMenu />
        <InkColorMenu property="border" />
        <InkColorMenu property="fill" />
        <InkTextStyleMenu />
      </div>
      <InkUndo />
      <InkRedo />
      <div class="scenario-actions" role="group" :aria-label="labels.suggest">
        <InkCommand id="sandbox.suggest" />
      </div>
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
      <InkSidebar
        v-model:open="pagesOpen"
        name="redactions-left"
        side="left"
        layout="rail"
      >
        <InkPanel id="pages" :label="labels.pages" :icon="Square">
          <InkThumbnails />
        </InkPanel>
      </InkSidebar>
      <InkViewport />
      <ReviewSidebar :labels="labels" />
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
    <InkThreadPopover />
    <CommandLog />
  </InkRoot>
</template>
