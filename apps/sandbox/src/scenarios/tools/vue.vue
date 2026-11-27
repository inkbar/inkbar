<script setup lang="ts">
/*
 * Only the tools you import end up in your bundle. This viewer registers highlight and note;
 * every other creation tool stays out, and its button has nothing to switch on. Select text and
 * Select come with every viewer.
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
import type { InkDocument } from '@inkbar/core'
import type { ToolId } from '@inkbar/core/dom'

const { source, messages, locale, labels, log, onDocument, openFile } =
  defineProps<ScenarioProps>()

const tools = [highlightTool(), noteTool()]

function onReady(doc: InkDocument): void {
  log('@ready', { pages: doc.pages.length })
  onDocument(doc)
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
    @update:tool="onTool"
  >
    <InkToolbar class="scenario-toolbar">
      <InkHighlightMenu />
      <div class="scenario-group" role="group" :aria-label="labels.tools">
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
        <InkToolButton tool="note" />
      </div>
      <InkUndo />
      <InkRedo />
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
