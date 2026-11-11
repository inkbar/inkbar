<script setup lang="ts">
/*
 * Your app owns the annotation list. Pass `annotations` and listen for `update:annotations` and
 * Inkbar stops keeping its own: every change arrives in the event, and what you hold is what
 * the viewer shows. Embedded annotations stay in the file and never pass through here.
 */
import { allTools } from '@inkbar/core/dom'
import {
  InkDownloadButton,
  InkPrintButton,
  InkColorMenu,
  InkHighlightMenu,
  InkIcon,
  InkLineStyleMenu,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRoot,
  InkShapeMenu,
  InkSignatureMenu,
  InkTextStyleMenu,
  InkThreadPopover,
  InkToolbar,
  InkToolbarButton,
  InkToolbarSeparator,
  InkToolButton,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/vue'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'
import { shallowRef } from 'vue'

import { FileUp } from '../../shared/file-up'
import { signatureFonts, storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { Annotation, InkDocument } from '@inkbar/core'
import type { ToolId } from '@inkbar/core/dom'

const { source, log, onDocument, openFile } = defineProps<ScenarioProps>()

const tools = allTools()
const annotations = shallowRef<Annotation[]>([])

function onChange(next: Annotation[]): void {
  annotations.value = next
  log('@update:annotations', { count: next.length })
}

function onReady(doc: InkDocument): void {
  log('@ready', { pages: doc.pages.length })
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
    :annotations="annotations"
    class="scenario-root"
    @ready="onReady"
    @update:tool="onTool"
    @update:annotations="onChange"
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
