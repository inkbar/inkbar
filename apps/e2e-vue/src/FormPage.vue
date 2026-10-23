<script setup lang="ts">
/*
 * A form fixture, opened with Inkbar keeping both annotations and field values, so its own
 * history undoes a field commit and the calculation it caused in one step. Form actions are
 * listed, newest first, because Inkbar never acts on them itself.
 */
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

import type { FormAction } from '@inkbar/core'

const props = defineProps<{ fixture: string }>()

const src = { url: fixtureUrl(props.fixture as FixtureName), key: props.fixture }
const status = ref('loading')
const actions = ref<string[]>([])

function onAction(a: FormAction): void {
  actions.value = [describeAction(a), ...actions.value]
}
</script>

<template>
  <InkRoot
    :src="src"
    :assets="assets"
    class="sandbox-root"
    @ready="status = 'ready'"
    @error="status = 'error'"
    @form-action="onAction"
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
    <p class="sandbox-status" role="status" data-testid="status">{{ status }}</p>
  </InkRoot>
</template>
