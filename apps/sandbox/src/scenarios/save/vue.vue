<script setup lang="ts">
/*
 * Download and Print write the session into the PDF: each annotation as a standard PDF
 * annotation other programs can read, and changed form values. With no changes you
 * get the file as it was opened. Open the saved file here and Inkbar's own
 * annotations come back ready to edit.
 */
import { highlightTool, noteTool } from '@inkbar/core/dom'
import {
  InkDownloadButton,
  InkPrintButton,
  InkHighlightMenu,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkThreadPopover,
  InkIcon,
  InkToolbar,
  InkToolbarButton,
  InkToolButton,
  InkUndo,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/vue'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument, InkError } from '@inkbar/core'
import type { ToolId } from '@inkbar/core/dom'

const { source, messages, locale, labels, log, onDocument, openFile } =
  defineProps<ScenarioProps>()

const tools = [highlightTool(), noteTool()]

function onReady(doc: InkDocument): void {
  log('@ready', { pages: doc.pages.length })
  onDocument(doc)
}

function onError(error: InkError): void {
  log('@error', { code: error.code })
}

function onTool(tool: ToolId): void {
  log('@update:tool', tool)
}
</script>

<template>
  <InkRoot
    :src="source"
    :messages="messages"
    :locale="locale"
    :assets="assets"
    :storage="storage"
    :tools="tools"
    class="scenario-root"
    @ready="onReady"
    @error="onError"
    @update:tool="onTool"
  >
    <InkToolbar class="scenario-toolbar">
      <div class="scenario-group" role="group" :aria-label="labels.tools">
        <InkHighlightMenu />
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
        <InkToolButton tool="note" />
      </div>
      <div class="scenario-group" role="group" :aria-label="labels.history">
        <InkUndo />
        <InkRedo />
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
    <InkViewport />
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
  </InkRoot>
</template>
