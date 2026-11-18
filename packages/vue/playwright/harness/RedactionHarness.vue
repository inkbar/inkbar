<script setup lang="ts">
/*
 * The apply redactions control in a toolbar over a document. `engine: 'held'` gives the root a
 * stand-in engine (`held-engine.ts`); `own` renders the host's own button through `asChild`.
 * The codes of the errors the root emits show in `errors`, and `useRedaction` shows in `probe`.
 */
import { ref } from 'vue'

import InkApplyRedactions from '../../src/components/InkApplyRedactions.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import { heldEngine } from './held-engine'
import RedactionProbe from './RedactionProbe.vue'

import type { DocumentSource, InkError, PdfAssets } from '@inkbar/core'

const props = defineProps<{
  src: DocumentSource
  assets: PdfAssets
  engine?: 'held'
  own?: boolean
}>()
const loader = props.engine ? heldEngine() : undefined
const errors = ref<string[]>([])
const onError = (e: InkError) => errors.value.push(e.code)
</script>

<template>
  <InkRoot
    :src="src"
    :assets="assets"
    :zoom="1"
    :engine="loader"
    :redaction-confirm="false"
    @error="onError"
  >
    <InkToolbar>
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
    <output data-testid="errors">{{ errors.join(' ') }}</output>
  </InkRoot>
</template>
