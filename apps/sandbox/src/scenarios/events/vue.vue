<script setup lang="ts">
/*
 * A plugin that hears presses and long presses (src/plugin/presses.ts). Register it in
 * `plugins`; it logs each one here and marks where it landed. Presses reach plugins only under
 * the select tools, and only when nothing in the viewer took them. A mouse click is a press; a
 * finger or pen held still for half a second is a long press. On a phone or tablet, two
 * fingers zoom the document rather than the page.
 */
import {
  InkDownloadButton,
  InkIcon,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkPrintButton,
  InkRoot,
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

import { pressesPlugin } from '../../plugin/presses'
import '../../plugin/presses.css'
import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

const { source, messages, locale, log, onDocument, openFile } =
  defineProps<ScenarioProps>()

const plugins = [pressesPlugin({ log })]

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
    :plugins="plugins"
    class="scenario-root"
    @ready="onReady"
  >
    <InkToolbar class="scenario-toolbar">
      <div class="scenario-group" role="group" aria-label="Tools">
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
      </div>
      <div class="scenario-group scenario-file" role="group" aria-label="File">
        <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" @click="openFile">
          <InkIcon :icon="FileUp" />
          Open
        </InkToolbarButton>
        <InkDownloadButton />
        <InkPrintButton />
      </div>
    </InkToolbar>
    <div class="scenario-body">
      <InkViewport />
    </div>
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
  </InkRoot>
</template>
