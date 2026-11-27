<script setup lang="ts">
/*
 * A locked file. The built-in prompt asks for the password when the file opens, so
 * there is nothing to wire up here. The password is "inkbar". Pass `passwordPrompt: false`
 * to turn the prompt off and handle the PasswordRequired error yourself.
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

import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument, InkError } from '@inkbar/core'

const { source, messages, locale, labels, log, onDocument, openFile } =
  defineProps<ScenarioProps>()

function onReady(doc: InkDocument): void {
  log('@ready', { pages: doc.pages.length })
  onDocument(doc)
}

function onError(error: InkError): void {
  log('@error', { code: error.code })
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
    @error="onError"
  >
    <InkToolbar class="scenario-toolbar">
      <div class="scenario-group" role="group" :aria-label="labels.tools">
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
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
      <InkViewport />
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
