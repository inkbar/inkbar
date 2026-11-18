<script setup lang="ts">
/*
 * The apply redactions control in a toolbar over a document. `engine: 'held'` gives the root a
 * stand-in engine (`held-engine.ts`); `own` renders the host's own button through `asChild`.
 * `confirm` passes `redactionConfirm` as a function answering yes or no, recording the marks
 * of each preview in `previews`; without it the root applies without asking. `throwing` makes
 * the `redacted` listener throw, and `shown: false` unmounts the root. The codes of the errors
 * the root emits show in `errors`, the `redacted` events in `redacted`, and `useRedaction` in
 * `probe`.
 */
import { allTools } from '@inkbar/core/dom'
import { ref } from 'vue'

import InkApplyRedactions from '../../src/components/InkApplyRedactions.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkToolButton from '../../src/components/InkToolButton.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import { heldEngine } from './held-engine'
import RedactionProbe from './RedactionProbe.vue'

import type { DocumentSource, InkError, PdfAssets, RedactionPreview } from '@inkbar/core'

const props = withDefaults(
  defineProps<{
    src: DocumentSource
    assets: PdfAssets
    engine?: 'held' | undefined
    own?: boolean
    confirm?: 'yes' | 'no' | undefined
    throwing?: boolean
    shown?: boolean
  }>(),
  { engine: undefined, confirm: undefined, shown: true }
)
const loader = props.engine ? heldEngine() : undefined
const tools = allTools()
const errors = ref<string[]>([])
const previews = ref<number[]>([])
const redacted = ref(0)
const onError = (e: InkError) => errors.value.push(e.code)
const ask = (preview: RedactionPreview) => {
  previews.value.push(preview.marks)
  return Promise.resolve(props.confirm === 'yes')
}
function onRedacted(): void {
  redacted.value++
  if (props.throwing) throw new Error('host failed')
}
</script>

<template>
  <div>
    <InkRoot
      v-if="shown"
      :src="src"
      :assets="assets"
      :zoom="1"
      :tools="tools"
      :engine="loader"
      :redaction-confirm="confirm ? ask : false"
      @error="onError"
      @redacted="onRedacted"
    >
      <InkToolbar>
        <InkToolButton tool="redact-area" />
        <InkApplyRedactions v-if="own" v-slot="{ label, busy, disabled }" as-child>
          <button
            class="host-apply"
            :data-busy="String(busy)"
            :data-disabled="String(disabled)"
          >
            {{ label }}
          </button>
        </InkApplyRedactions>
        <InkApplyRedactions v-else />
      </InkToolbar>
      <!-- Test-only box: the scroll container needs a bounded height. -->
      <div style="height: 400px; width: 600px"><InkViewport /></div>
      <RedactionProbe />
    </InkRoot>
    <output data-testid="errors">{{ errors.join(' ') }}</output>
    <output data-testid="previews">{{ previews.join(' ') }}</output>
    <output data-testid="redacted">{{ redacted }}</output>
  </div>
</template>
