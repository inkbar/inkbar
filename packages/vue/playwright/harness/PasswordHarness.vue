<script setup lang="ts">
import { ref } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

withDefaults(
  defineProps<{
    src: DocumentSource | null
    assets: PdfAssets
    password?: string | undefined
    passwordPrompt?: boolean | undefined
    /** Renders the viewport's `locked` slot with a button that calls `promptPassword`. */
    customLocked?: boolean | undefined
  }>(),
  { passwordPrompt: undefined }
)

// Playwright serialises emitted Errors without their own properties, so the codes go in the DOM.
const codes = ref<string[]>([])
</script>

<template>
  <InkRoot
    :src="src"
    :assets="assets"
    :password="password"
    :password-prompt="passwordPrompt"
    @error="(e) => codes.push(e.code)"
  >
    <template #default="{ status }">
      <output data-testid="status">{{
        status.state === 'locked' ? JSON.stringify(status) : status.state
      }}</output>
      <output data-testid="error-codes">{{ codes.join(',') }}</output>
      <InkViewport>
        <template v-if="customLocked" #locked="{ incorrect, promptPassword }">
          <button type="button" data-testid="custom-unlock" @click="promptPassword">
            Custom unlock {{ incorrect ? 'again' : '' }}
          </button>
        </template>
      </InkViewport>
    </template>
  </InkRoot>
</template>
