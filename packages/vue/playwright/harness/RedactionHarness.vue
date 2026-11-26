<script setup lang="ts">
/*
 * The apply redactions control in a toolbar over a document. `engine: 'held'` makes the held
 * engine (`held-engine.ts`) the one the root's document uses; `own` renders the host's own
 * button through `asChild`, and `own: 'div'` a `div` in its place.
 * `confirm` passes `redactionConfirm` as a function answering yes or no, recording the marks
 * of each preview in `previews`; without it the root applies without asking. `throwing` makes
 * the `redacted` listener throw, and `shown: false` unmounts the root. `controlled` keeps the
 * annotations in the host with history on, answering each proposal at once; with `late` the
 * one that follows a `redacted` event waits for the page to call `window.__releaseAnswer()`,
 * and with `never` it is dropped. Their types show in `list`, and the types of every proposal
 * the host hears in `proposals` (one list per `|`). `disabled` is the host's own `disabled` on
 * the control, and `prevent` a `click` listener on it that calls `preventDefault()`. The
 * toolbar holds Download and Print too, and the root a thread popover, with
 * `window.__inkActivate` to open it. `swap` is a source the `redacted` listener passes as the new `src`. `relabel`
 * passes new words for the done message as the redacted file opens (on its `ready`). A `retry` button submits the password prompt, which opens the document's source
 * again. The codes of the errors the root emits show in `errors`, the `redacted` events in
 * `redacted`, and `useRedaction` in `probe`.
 */
import { allTools } from '@inkbar/core/dom'
import { computed, onUnmounted, ref, shallowRef } from 'vue'

import InkApplyRedactions from '../../src/components/InkApplyRedactions.vue'
import InkDownloadButton from '../../src/components/InkDownloadButton.vue'
import InkPrintButton from '../../src/components/InkPrintButton.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkThreadPopover from '../../src/components/InkThreadPopover.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkToolButton from '../../src/components/InkToolButton.vue'
import InkUndo from '../../src/components/InkUndo.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import ActivateHook from './ActivateHook.vue'
import { holdEngine } from './held-engine'
import RedactionProbe from './RedactionProbe.vue'
import RetryButton from './RetryButton.vue'

import type {
  Annotation,
  DocumentSource,
  InkError,
  InkMessagesInput,
  PdfAssets,
  RedactionPreview,
} from '@inkbar/core'

const props = withDefaults(
  defineProps<{
    src: DocumentSource
    assets: PdfAssets
    engine?: 'held' | undefined
    own?: boolean | 'div'
    confirm?: 'yes' | 'no' | undefined
    throwing?: boolean
    shown?: boolean
    controlled?: 'now' | 'late' | 'never' | undefined
    disabled?: boolean
    prevent?: boolean
    swap?: DocumentSource | undefined
    relabel?: boolean
  }>(),
  {
    engine: undefined,
    own: false,
    confirm: undefined,
    shown: true,
    controlled: undefined,
    swap: undefined,
  }
)
// The held engine is core's engine factory, cleared when the harness unmounts.
if (props.engine) onUnmounted(holdEngine())
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
const proposals = ref<string[]>([])
/** Set by the `redacted` event: the next proposal is the redaction's. */
let redactionNext = false
function answer(next: Annotation[]): void {
  proposals.value.push(next.map((a) => a.type).join(' '))
  const held = props.controlled !== 'now' && redactionNext
  redactionNext = false
  if (!held) annotations.value = next
  else if (props.controlled === 'late')
    window.__releaseAnswer = () => (annotations.value = next)
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
const messages = shallowRef<InkMessagesInput | undefined>(undefined)
/** The documents that have been ready, so `relabel` waits for the redacted one. */
let readies = 0
function onReady(): void {
  readies++
  if (props.relabel && readies === 2)
    messages.value = { viewer: { redactDone: ({ marks }) => `${marks} fertig.` } }
}
/** Set by `onRedacted` from `swap`: the host's new source. */
const swapped = shallowRef<DocumentSource | null>(null)
function onRedacted(): void {
  redacted.value++
  redactionNext = true
  if (props.swap) swapped.value = props.swap
  if (props.throwing) throw new Error('host failed')
}
</script>

<template>
  <div>
    <InkRoot
      v-if="shown"
      v-bind="model"
      :src="swapped ?? src"
      :assets="assets"
      :zoom="1"
      :tools="tools"
      :redaction-confirm="confirm ? ask : false"
      :messages="messages"
      @ready="onReady"
      @error="onError"
      @redacted="onRedacted"
    >
      <InkToolbar>
        <InkToolButton tool="select-text" />
        <InkToolButton tool="redact-area" />
        <InkUndo />
        <InkApplyRedactions
          v-if="own === 'div'"
          v-slot="{ label, disabled: off }"
          as-child
          :disabled="props.disabled"
        >
          <div role="button" class="host-apply" :data-disabled="String(off)">
            {{ label }}
          </div>
        </InkApplyRedactions>
        <InkApplyRedactions
          v-else-if="own"
          v-slot="{ label, busy, disabled: off }"
          as-child
          :disabled="props.disabled"
        >
          <button
            class="host-apply"
            :data-busy="String(busy)"
            :data-disabled="String(off)"
          >
            {{ label }}
          </button>
        </InkApplyRedactions>
        <InkApplyRedactions
          v-else
          @click="(e: MouseEvent) => prevent && e.preventDefault()"
        />
        <InkDownloadButton />
        <InkPrintButton />
      </InkToolbar>
      <!-- Test-only box: the scroll container needs a bounded height. -->
      <div style="height: 400px; width: 600px"><InkViewport /></div>
      <RedactionProbe />
      <InkThreadPopover />
      <ActivateHook />
      <RetryButton />
    </InkRoot>
    <output data-testid="errors">{{ errors.join(' ') }}</output>
    <output data-testid="previews">{{ previews.join(' ') }}</output>
    <output data-testid="redacted">{{ redacted }}</output>
    <output data-testid="proposals">{{ proposals.join('|') }}</output>
    <output data-testid="list">{{ annotations.map((a) => a.type).join(' ') }}</output>
  </div>
</template>
