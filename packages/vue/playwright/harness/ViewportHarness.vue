<script setup lang="ts">
import { ref } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import type { DocumentSource, PdfAssets } from '@inkbar/core'
import type { ZoomValue } from '@inkbar/core/dom'

defineProps<{
  src: DocumentSource | null
  assets: PdfAssets
  zoom?: ZoomValue | undefined
  page?: number | undefined
  buffer?: number | undefined
  customAnnotations?: boolean | undefined
  customLoading?: boolean | undefined
}>()
const emit = defineEmits<{ 'update:zoom': [z: ZoomValue]; 'update:page': [p: number] }>()
const clicks = ref(0)
</script>

<template>
  <div>
    <button type="button" data-testid="outside" @click="clicks++">
      Outside {{ clicks }}
    </button>
    <InkRoot
      :src="src"
      :assets="assets"
      :zoom="zoom"
      :page="page"
      @update:zoom="emit('update:zoom', $event)"
      @update:page="emit('update:page', $event)"
    >
      <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
      <div style="height: 700px; width: 900px">
        <InkViewport :buffer="buffer ?? 2">
          <template v-if="customLoading" #loading>
            <span data-testid="custom-loading">Opening the file</span>
          </template>
          <template
            v-if="customAnnotations"
            #annotation="{ annotation, state, locked, accept, dismiss }"
          >
            <span
              class="my-pin"
              :data-type="annotation.type"
              :data-pin-state="state"
              :data-pin-locked="String(locked)"
            >
              Pin
            </span>
            <template
              v-if="annotation.type === 'redact' && annotation.origin === 'suggested'"
            >
              <button type="button" data-testid="accept" @click="accept">Accept</button>
              <button type="button" data-testid="dismiss" @click="dismiss">
                Dismiss
              </button>
            </template>
          </template>
        </InkViewport>
      </div>
    </InkRoot>
  </div>
</template>
