<script setup lang="ts">
import { ref } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import type { DocumentSource, InkDocument, PdfAssets } from '@inkbar/core'
import type { ToolId, ZoomValue } from '@inkbar/core/dom'

const props = defineProps<{
  src: DocumentSource | null
  assets: PdfAssets
  zoom?: ZoomValue | undefined
  page?: number | undefined
  buffer?: number | undefined
  gap?: number | undefined
  customAnnotations?: boolean | undefined
  customLoading?: boolean | undefined
  tool?: ToolId | undefined
  /** Zero-based page whose page lookups reject until the Heal button is pressed. */
  failPage?: number | undefined
}>()
const emit = defineEmits<{ 'update:zoom': [z: ZoomValue]; 'update:page': [p: number] }>()
const clicks = ref(0)

// Stands in for a page PDF.js cannot render: the canvas and text layer both look the page up
// through `_pdfjs.getPage`, so failing it fails that page's mount and nothing else.
let failing = true
function heal(): void {
  failing = false
}
function onReady(doc: InkDocument): void {
  const target = props.failPage
  if (target === undefined) return
  const handles = doc._pdfjs
  const original = handles.getPage.bind(handles)
  handles.getPage = (index) =>
    failing && index === target
      ? Promise.reject(new Error('The page could not be drawn by the engine'))
      : original(index)
}
</script>

<template>
  <div>
    <button type="button" data-testid="outside" @click="clicks++">
      Outside {{ clicks }}
    </button>
    <button type="button" data-testid="heal" @click="heal">Heal</button>
    <InkRoot
      :src="src"
      :assets="assets"
      :zoom="zoom"
      :page="page"
      :tool="tool"
      @update:zoom="emit('update:zoom', $event)"
      @update:page="emit('update:page', $event)"
      @ready="onReady"
    >
      <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
      <div style="height: 700px; width: 900px">
        <InkViewport :buffer="buffer ?? 2" :gap="gap ?? 16">
          <template v-if="customLoading" #loading>
            <span data-testid="custom-loading">Opening the file</span>
          </template>
          <template
            v-if="customAnnotations"
            #annotation="{ annotation, state, locked, select, accept, dismiss }"
          >
            <span
              class="my-pin"
              :data-type="annotation.type"
              :data-pin-state="state"
              :data-pin-locked="String(locked)"
            >
              Pin
            </span>
            <template
              v-if="annotation.type === 'redact' && annotation.origin === 'suggested'"
            >
              <button type="button" data-testid="select" @click="select">Select</button>
              <button type="button" data-testid="accept" @click="accept">Accept</button>
              <button type="button" data-testid="dismiss" @click="dismiss">
                Dismiss
              </button>
              <input data-testid="slot-input" aria-label="Comment" />
            </template>
          </template>
        </InkViewport>
      </div>
    </InkRoot>
  </div>
</template>
