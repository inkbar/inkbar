<script setup lang="ts">
/*
 * Uncontrolled: the document keeps its own annotations and undo history. The toolbars are
 * built from Inkbar's components, so each control is yours to keep, move or drop. Pass a
 * button your own icon to replace the one it shows. Suggest redactions is the app's own
 * extension: Actions adds the button, SuggestionCard the review card, and decorateSuggestion
 * tags each suggested mark so the page can draw it dashed.
 */
import {
  InkColorMenu,
  InkHighlightMenu,
  InkLineStyleMenu,
  InkTextStyleMenu,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkShapeMenu,
  InkSignatureMenu,
  InkThreadPopover,
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

import { signatureFonts, signatures } from '../shared/signatures'
import { decorateSuggestion } from '../shared/suggestion'

import Actions from './Actions.vue'
import SuggestionCard from './SuggestionCard.vue'

import type { DocumentSource } from '@inkbar/core'

defineProps<{ source: DocumentSource }>()
</script>

<template>
  <InkRoot
    :src="source"
    :assets="assets"
    :signatures="signatures"
    :signature-fonts="signatureFonts"
    :decorate-annotation="decorateSuggestion"
    class="demo-root"
  >
    <InkToolbar class="demo-toolbar">
      <InkHighlightMenu />
      <div class="demo-group" role="group" aria-label="Tools">
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
      <div class="demo-group" role="group" aria-label="Style">
        <InkLineStyleMenu />
        <InkColorMenu property="border" />
        <InkColorMenu property="fill" />
        <InkTextStyleMenu />
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
    <InkThreadPopover />
    <SuggestionCard />
  </InkRoot>
</template>
