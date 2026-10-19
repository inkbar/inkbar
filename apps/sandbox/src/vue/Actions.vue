<script setup lang="ts">
/* Composables only work inside InkRoot, so these controls are their own component. */
import { isInkError } from '@inkbar/core'
import { useAnnotations, useDocument, useHistory } from '@inkbar/vue'
import { onScopeDispose, watch, ref } from 'vue'

import { exposeDocument } from '../shared/e2e-hook'
import { suggestionCount, suggestRedactions } from '../shared/suggest'

const { document, isReady } = useDocument()
const { annotations, add } = useAnnotations()
const { batch } = useHistory()
const busy = ref(false)
const result = ref('')

watch(document, (doc) => exposeDocument(doc), { immediate: true })
onScopeDispose(() => exposeDocument(null))

async function suggest() {
  const doc = document.value
  if (!doc) return
  busy.value = true
  try {
    const found = await suggestRedactions(doc, annotations.value)
    batch(() => {
      for (const input of found) add(input)
    })
    result.value = suggestionCount(found.length)
  } catch (e) {
    // Opening another file mid-run destroys the document; that is not a failure.
    if (!(isInkError(e) && e.code === 'DocumentDestroyed'))
      result.value = 'Could not check this document.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="demo-actions" role="group" aria-label="Suggest">
    <button type="button" :disabled="!isReady || busy" @click="suggest">
      Suggest redactions
    </button>
    <span class="demo-result" role="status">{{ result }}</span>
  </div>
</template>
