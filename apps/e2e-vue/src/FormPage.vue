<script setup lang="ts">
/*
 * A form fixture, opened with Inkbar keeping both annotations and field values, so its own
 * history undoes a field commit and the calculation it caused in one step. Form actions are
 * listed, newest first, because Inkbar never acts on them itself. On the engine-reader route
 * the page is given the engine, and the status names the reader, for the tests.
 */
import { readerOf } from '@inkbar/e2e-shared/engine-reader'
import { describeAction } from '@inkbar/e2e-shared/form-actions'
import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import {
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkToolbar,
  InkToolButton,
  InkUndo,
  InkViewport,
} from '@inkbar/vue'
import { assets } from 'virtual:inkbar-assets'
import { ref } from 'vue'

import type { InkDocument, ViewerAction } from '@inkbar/core'

const props = defineProps<{ fixture: string; engineReader?: boolean }>()

const engine = props.engineReader ? () => import('@inkbar/engine') : undefined

const src = { url: fixtureUrl(props.fixture as FixtureName), key: props.fixture }
const status = ref('loading')
const actions = ref<string[]>([])
const reader = ref('')

function onReady(doc: InkDocument): void {
  reader.value = readerOf(doc)
  status.value = 'ready'
}

function onAction(a: ViewerAction): void {
  actions.value = [describeAction(a), ...actions.value]
}
</script>

<template>
  <InkRoot
    :src="src"
    :assets="assets"
    :engine="engine"
    class="sandbox-root"
    @ready="onReady"
    @error="status = 'error'"
    @action="onAction"
  >
    <InkToolbar>
      <InkToolButton tool="select-text" />
      <InkToolButton tool="select" />
      <InkUndo />
      <InkRedo />
    </InkToolbar>
    <div class="sandbox-editor">
      <InkViewport />
      <InkToolbar label="Page">
        <InkPrevPage />
        <InkPageInput />
        <InkPageCount />
        <InkNextPage />
      </InkToolbar>
    </div>
    <ol class="sandbox-actions" aria-label="Form actions" data-testid="form-actions">
      <li v-for="(line, i) in actions" :key="actions.length - i">{{ line }}</li>
    </ol>
    <p class="sandbox-status" role="status" data-testid="status" :data-reader="reader">
      {{ status }}
    </p>
  </InkRoot>
</template>
