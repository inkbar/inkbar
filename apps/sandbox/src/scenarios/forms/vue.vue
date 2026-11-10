<script setup lang="ts">
/*
 * Form filling needs no creation tools: the viewer passes none. Fields edit in place, and the
 * document keeps their values and undo history, so Undo covers field edits too. Signature
 * fields sign from a popover with a saved signature, from the store and fonts passed here. The
 * form's requests (submit, open a link, print) come to @action, because Inkbar never
 * sends, opens or prints anything itself.
 */
import {
  InkDownloadButton,
  InkPrintButton,
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
import { onBeforeUnmount } from 'vue'

import { FileUp } from '../../shared/file-up'
import { changedFields } from '../../shared/form'
import { signatureFonts, signatures } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { FieldValues, ViewerAction, InkDocument } from '@inkbar/core'

const { source, log, onDocument, openFile } = defineProps<ScenarioProps>()

/** Stops following the open document's field values. */
let unfollow = (): void => undefined
onBeforeUnmount(() => unfollow())

function onReady(doc: InkDocument): void {
  log('@ready', { pages: doc.pages.length })
  // The field values are a readable on the form: follow them while the document is open.
  unfollow()
  let before: FieldValues = doc.form.values.get()
  unfollow = doc.form.values.subscribe((values) => {
    log('form.values', { fields: changedFields(before, values) })
    before = values
  })
  onDocument(doc)
}

function onAction(action: ViewerAction): void {
  log('@action', action)
}
</script>

<template>
  <InkRoot
    :src="source"
    :assets="assets"
    :signatures="signatures"
    :signature-fonts="signatureFonts"
    class="scenario-root"
    @ready="onReady"
    @action="onAction"
  >
    <InkToolbar class="scenario-toolbar">
      <div class="scenario-group" role="group" aria-label="Tools">
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
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
