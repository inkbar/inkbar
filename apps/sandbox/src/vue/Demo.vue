<script setup lang="ts">
/*
 * Uncontrolled: the document keeps its own annotations and undo history. The toolbars are
 * built from Inkbar's components, so each control is yours to keep, move or drop. Pass a
 * button your own icon to replace the one it shows.
 */
import {
  InkColorMenu,
  InkLineStyleMenu,
  InkNextPage,
  InkNotePopover,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkSuggestionCard,
  InkToolbar,
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

import Actions from './Actions.vue'

import type { DocumentSource } from '@inkbar/core'

defineProps<{ source: DocumentSource }>()
</script>

<template>
  <InkRoot :src="source" :assets="assets" class="demo-root">
    <InkToolbar class="demo-toolbar">
      <div class="demo-group" role="group" aria-label="Highlight">
        <InkToolButton tool="highlight" />
      </div>
      <div class="demo-group" role="group" aria-label="Tools">
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
        <InkToolButton tool="redact-area" />
        <InkToolButton tool="note" />
      </div>
      <InkToolbarSeparator />
      <div class="demo-group" role="group" aria-label="Style">
        <InkLineStyleMenu />
        <InkColorMenu property="border" />
        <InkColorMenu property="fill" />
      </div>
      <InkUndo />
      <InkRedo />
      <Actions />
    </InkToolbar>
    <InkViewport />
    <InkToolbar label="Page and zoom" class="demo-status-bar">
      <div class="demo-group" role="group" aria-label="Page">
        <InkPrevPage />
        <InkPageInput />
        <InkPageCount />
        <InkNextPage />
      </div>
      <div class="demo-group demo-zoom" role="group" aria-label="Zoom">
        <InkZoomOut />
        <InkZoomSelect />
        <InkZoomIn />
      </div>
    </InkToolbar>
    <InkNotePopover />
    <InkSuggestionCard />
  </InkRoot>
</template>
