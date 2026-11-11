<script setup lang="ts">
/*
 * Every creation tool, on a document that already has one of each annotation. The toolbars are
 * built from Inkbar's components, so each control is yours to keep, move or drop. The viewer
 * reports what happens through its events; this file passes each one to `log`.
 */
import { allTools } from '@inkbar/core/dom'
import {
  InkDownloadButton,
  InkPrintButton,
  InkColorMenu,
  InkHighlightMenu,
  InkLineStyleMenu,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkShapeMenu,
  InkSignatureMenu,
  InkTextStyleMenu,
  InkThreadPopover,
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
} from '@inkbar/vue'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'
import { onBeforeUnmount } from 'vue'

import { FileUp } from '../../shared/file-up'
import { signatureFonts, storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'
import type { ToolId } from '@inkbar/core/dom'

const { source, log, onDocument, openFile } = defineProps<ScenarioProps>()

const tools = allTools()
/** Stops following the open document's annotations. */
let unfollow = (): void => undefined
onBeforeUnmount(() => unfollow())

function onReady(doc: InkDocument): void {
  log('@ready', { pages: doc.pages.length })
  // The annotation list is a readable on the document: follow it while the document is open.
  unfollow()
  unfollow = doc.annotations.list.subscribe((list) =>
    log('annotations.list', { count: list.length })
  )
  onDocument(doc)
}

function onTool(tool: ToolId): void {
  log('@update:tool', tool)
}

function onActivate(id: string): void {
  log('@activate', id)
}
</script>

<template>
  <InkRoot
    :src="source"
    :assets="assets"
    :tools="tools"
    :storage="storage"
    :signature-fonts="signatureFonts"
    class="scenario-root"
    @ready="onReady"
    @update:tool="onTool"
    @activate="onActivate"
  >
    <InkToolbar class="scenario-toolbar">
      <InkHighlightMenu />
      <div class="scenario-group" role="group" aria-label="Tools">
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
        <InkToolButton tool="redact-area" />
        <InkToolButton tool="sketch" />
        <InkToolButton tool="draw" />
        <InkShapeMenu />
        <InkToolButton tool="freetext" />
        <InkSignatureMenu />
        <InkToolButton tool="note" />
      </div>
      <InkToolbarSeparator />
      <div class="scenario-group" role="group" aria-label="Style">
        <InkLineStyleMenu />
        <InkColorMenu property="border" />
        <InkColorMenu property="fill" />
        <InkTextStyleMenu />
      </div>
      <InkUndo />
      <InkRedo />
      <div class="scenario-group scenario-file" role="group" aria-label="File">
        <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" @click="openFile">
          <InkIcon :icon="FileUp" />
          Open
        </InkToolbarButton>
        <InkDownloadButton />
        <InkPrintButton />
      </div>
    </InkToolbar>
    <InkViewport />
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
    <InkThreadPopover />
  </InkRoot>
</template>
