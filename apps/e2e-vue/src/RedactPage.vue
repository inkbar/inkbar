<script setup lang="ts">
/*
 * A redaction fixture with the apply redactions control, opened with the engine. Controlled,
 * the host keeps the annotations with history on and shows their types. Each `redacted` event's
 * bytes are kept for the tests, and "Open the redacted file" passes the last as a new `src`.
 */
import { allTools } from '@inkbar/core/dom'
import { keepRedacted } from '@inkbar/e2e-shared/redaction-page'
import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import {
  InkApplyRedactions,
  InkDownloadButton,
  InkRedo,
  InkRoot,
  InkToolbar,
  InkToolButton,
  InkUndo,
  InkViewport,
  InkZoomIn,
  InkZoomSelect,
} from '@inkbar/vue'
import { assets } from 'virtual:inkbar-assets'
import { computed, ref, shallowRef } from 'vue'

import type { Annotation, DocumentSource, RedactionResult } from '@inkbar/core'

const props = defineProps<{ fixture: string; controlled: boolean; confirm: boolean }>()

const tools = allTools()
const status = ref('loading')

function onReady(): void {
  status.value = 'ready'
}
const annotations = ref<Annotation[]>([])
const src = shallowRef<DocumentSource>({
  url: fixtureUrl(props.fixture as FixtureName),
  key: props.fixture,
})
const last = shallowRef<Uint8Array | null>(null)
const applied = ref<RedactionResult | null>(null)

/** Controlled: the list and its updates, with history on. Uncontrolled: neither. */
const model = computed(() =>
  props.controlled
    ? {
        annotations: annotations.value,
        'onUpdate:annotations': (next: Annotation[]) => (annotations.value = next),
        history: true,
      }
    : {}
)

function onRedacted(e: { bytes: Uint8Array; result: RedactionResult }): void {
  keepRedacted(e.bytes)
  last.value = e.bytes
  applied.value = e.result
}

function openRedacted(): void {
  if (last.value) src.value = { data: last.value.slice(), key: `${props.fixture}-copy` }
}
</script>

<template>
  <InkRoot
    v-bind="model"
    :tools="tools"
    :src="src"
    :assets="assets"
    :redaction-confirm="confirm ? undefined : false"
    class="sandbox-root"
    @ready="onReady"
    @error="status = 'error'"
    @redacted="onRedacted"
  >
    <InkToolbar>
      <InkToolButton tool="select-text" />
      <InkToolButton tool="redact-area" />
      <InkToolButton tool="shape" />
      <InkZoomSelect />
      <InkZoomIn />
      <InkUndo />
      <InkRedo />
      <InkApplyRedactions />
      <InkDownloadButton />
      <div class="sandbox-actions" role="group" aria-label="Redacted file">
        <button
          type="button"
          data-testid="open-redacted"
          :disabled="!last"
          @click="openRedacted"
        >
          Open the redacted file
        </button>
      </div>
    </InkToolbar>
    <div class="sandbox-editor">
      <InkViewport />
    </div>
    <p
      class="sandbox-status"
      role="status"
      data-testid="status"
      :data-applied="applied?.marks ?? ''"
    >
      {{ status }}
    </p>
    <output v-if="controlled" class="sandbox-status" data-testid="host-list">{{
      annotations.map((a) => a.type).join(' ')
    }}</output>
  </InkRoot>
</template>
