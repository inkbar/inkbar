<script setup lang="ts">
/*
 * The standard toolbar: tools, zoom and page controls with icons. It adds no styles of its
 * own; the theme styles the `data-ink-*` hooks. Extra controls go in the default slot.
 */
import {
  Hand,
  Highlighter,
  MessageSquare,
  MousePointer2,
  Square,
  ZoomIn,
  ZoomOut,
} from '@lucide/vue'

import InkPageCount from '../components/InkPageCount.vue'
import InkPageInput from '../components/InkPageInput.vue'
import InkToolbar from '../components/InkToolbar.vue'
import InkToolButton from '../components/InkToolButton.vue'
import InkZoomIn from '../components/InkZoomIn.vue'
import InkZoomOut from '../components/InkZoomOut.vue'
import InkZoomSelect from '../components/InkZoomSelect.vue'

withDefaults(defineProps<{ label?: string }>(), { label: 'Document tools' })

const ICON = 18
</script>

<template>
  <InkToolbar :label="label" class="ink-default-toolbar" data-ink-default-toolbar>
    <div
      class="ink-toolbar-group"
      data-ink-toolbar-group="tools"
      role="group"
      aria-label="Tools"
    >
      <InkToolButton tool="view"><Hand :size="ICON" aria-hidden="true" /></InkToolButton>
      <InkToolButton tool="select">
        <MousePointer2 :size="ICON" aria-hidden="true" />
      </InkToolButton>
      <InkToolButton tool="highlight">
        <Highlighter :size="ICON" aria-hidden="true" />
      </InkToolButton>
      <InkToolButton tool="redact-area">
        <Square :size="ICON" aria-hidden="true" />
      </InkToolButton>
      <InkToolButton tool="note">
        <MessageSquare :size="ICON" aria-hidden="true" />
      </InkToolButton>
    </div>
    <div
      class="ink-toolbar-group"
      data-ink-toolbar-group="zoom"
      role="group"
      aria-label="Zoom"
    >
      <InkZoomOut><ZoomOut :size="ICON" aria-hidden="true" /></InkZoomOut>
      <InkZoomSelect />
      <InkZoomIn><ZoomIn :size="ICON" aria-hidden="true" /></InkZoomIn>
    </div>
    <div
      class="ink-toolbar-group"
      data-ink-toolbar-group="page"
      role="group"
      aria-label="Page"
    >
      <InkPageInput />
      <InkPageCount />
    </div>
    <slot />
  </InkToolbar>
</template>
