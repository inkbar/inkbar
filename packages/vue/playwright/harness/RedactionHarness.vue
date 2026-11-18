<script setup lang="ts">
/*
 * The apply redactions control in a toolbar over a document. `engine: 'held'` gives the root a
 * stand-in engine (`held-engine.ts`); `own` renders the host's own button through `asChild`.
 * `confirm` passes `redactionConfirm` as a function answering yes or no, recording the marks
 * of each preview in `previews`; without it the root applies without asking. `throwing` makes
 * the `redacted` listener throw, and `shown: false` unmounts the root. `controlled` keeps the
 * annotations in the host with history on, answering each proposal at once, or (`late`) the
 * one that follows a `redacted` event after a delay; their types show in `list`. The codes of the errors
 * the root emits show in `errors`, the `redacted` events in `redacted`, and `useRedaction` in
 * `probe`.
 */
import { allTools } from '@inkbar/core/dom'
import { computed, ref } from 'vue'

import InkApplyRedactions from '../../src/components/InkApplyRedactions.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkToolButton from '../../src/components/InkToolButton.vue'
import InkUndo from '../../src/components/InkUndo.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import { heldEngine } from './held-engine'
import RedactionProbe from './RedactionProbe.vue'

import type {
  Annotation,
  DocumentSource,
  InkError,
  PdfAssets,
  RedactionPreview,
} from '@inkbar/core'

const props = withDefaults(
  defineProps<{
    src: DocumentSource
    assets: PdfAssets
    engine?: 'held' | undefined
    own?: boolean
    confirm?: 'yes' | 'no' | undefined
    throwing?: boolean
    shown?: boolean
    controlled?: 'now' | 'late' | undefined
  }>(),
  { engine: undefined, confirm: undefined, shown: true, controlled: undefined }
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
const annotations = ref<Annotation[]>([])
/** Set by the `redacted` event: the next proposal is the redaction's. */
let redactionNext = false
function answer(next: Annotation[]): void {
  const late = props.controlled === 'late' && redactionNext
  redactionNext = false
  if (late) setTimeout(() => (annotations.value = next), 50)
  else annotations.value = next
}
/** Controlled: the list and its updates, with history on. Uncontrolled: neither. */
const model = computed(() =>
  props.controlled
    ? {
        annotations: annotations.value,
        'onUpdate:annotations': answer,
        history: true,
      }
    : {}
)
function onRedacted(): void {
  redacted.value++
  redactionNext = true
  if (props.throwing) throw new Error('host failed')
}
</script>

<template>
  <div>
    <InkRoot
      v-if="shown"
      v-bind="model"
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
        <InkUndo />
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
    <output data-testid="list">{{ annotations.map((a) => a.type).join(' ') }}</output>
  </div>
</template>
