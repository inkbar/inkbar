<script setup lang="ts">
import {
  createMemorySignatureStore,
  type FieldsChange,
  type FieldValues,
  type FormAction,
  type InkError,
  type PdfAssets,
  type SignatureTemplate,
} from '@inkbar/core'
import { ref, shallowRef } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkUndo from '../../src/components/InkUndo.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import ComposableProbe from './ComposableProbe.vue'
import FormProbe from './FormProbe.vue'

const props = withDefaults(
  defineProps<{
    src: string
    assets: PdfAssets
    /** Puts the fields under the harness's control, starting from `initial`. */
    controlled?: boolean
    initial?: FieldValues
    /** What the Push button sets the controlled value to. */
    push?: FieldValues
    templates?: SignatureTemplate[]
    formHighlight?: boolean | undefined
    /** What the Swap button opens next, and the controlled values it starts from. */
    swapTo?: { src: string; initial?: FieldValues } | undefined
  }>(),
  {
    controlled: false,
    initial: () => ({}),
    push: () => ({}),
    templates: () => [],
    formHighlight: undefined,
    swapTo: undefined,
  }
)
const emit = defineEmits<{
  'form-action': [action: FormAction]
  error: [error: InkError]
  changed: [next: FieldValues, change: FieldsChange | undefined]
}>()

/** A host that owns the values through v-model, the way an app would. */
const values = ref<FieldValues>(props.initial)
const src = ref(props.src)
const heard = ref(0)
const store = shallowRef(createMemorySignatureStore(props.templates))

function onFields(next: FieldValues, change?: FieldsChange): void {
  heard.value++
  values.value = next
  emit('changed', next, change)
}
function onPush(): void {
  values.value = { ...values.value, ...props.push }
}
function onSwap(): void {
  if (!props.swapTo) return
  src.value = props.swapTo.src
  values.value = props.swapTo.initial ?? {}
}
</script>

<template>
  <InkRoot
    :src="src"
    :assets="props.assets"
    :zoom="1"
    :signatures="store"
    :fields="props.controlled ? values : undefined"
    :form-highlight="props.formHighlight"
    @update:fields="onFields"
    @form-action="emit('form-action', $event)"
    @error="emit('error', $event)"
  >
    <InkToolbar>
      <InkUndo />
    </InkToolbar>
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 600px; width: 900px">
      <InkViewport />
    </div>
    <output
      data-testid="host-fields"
      :data-values="JSON.stringify(values)"
      :data-heard="heard"
    />
    <button type="button" data-testid="push" @click="onPush">push</button>
    <button type="button" data-testid="swap" @click="onSwap">swap</button>
    <FormProbe />
    <ComposableProbe />
  </InkRoot>
</template>
