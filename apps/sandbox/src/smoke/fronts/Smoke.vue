<script setup lang="ts">
/*
 * The Vue front end: InkRoot with the same controls as the other three. Apply goes through
 * `useRedaction().apply`, which needs InkRoot around it, so a small child hands it over.
 */
import {
  InkApplyRedactions,
  InkDownloadButton,
  InkOutline,
  InkPageCount,
  InkPageInput,
  InkPrintButton,
  InkRedo,
  InkRoot,
  InkThreadPopover,
  InkThumbnails,
  InkToolbar,
  InkToolButton,
  InkUndo,
  InkViewport,
  useRedaction,
} from '@inkbar/vue'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'
import { defineComponent } from 'vue'

import { engine, redactionConfirm, tools as makeTools } from '../front.ts'

import type { FrontProps } from '../front.ts'
import type { InkError } from '@inkbar/core'

const props = defineProps<FrontProps>()

const tools = makeTools()

function onError(error: InkError): void {
  console.info('viewer error', error.code)
}

const Apply = defineComponent(() => {
  const { apply } = useRedaction()
  props.onApply(apply)
  return () => null
})
</script>

<template>
  <InkRoot
    :src="props.source"
    :messages="props.messages"
    :assets="assets"
    :tools="tools"
    :engine="engine"
    :redaction-confirm="redactionConfirm"
    @ready="props.onReady"
    @redacted="({ bytes }) => props.onRedacted(bytes)"
    @error="onError"
  >
    <Apply />
    <InkToolbar>
      <InkToolButton tool="select-text" />
      <InkToolButton tool="highlight" />
      <InkToolButton tool="draw" />
      <InkToolButton tool="redact-area" />
      <InkUndo />
      <InkRedo />
      <InkApplyRedactions />
      <InkDownloadButton />
      <InkPrintButton />
      <InkPageInput />
      <InkPageCount />
    </InkToolbar>
    <InkViewport />
    <div class="smoke-panels">
      <InkThumbnails />
      <InkOutline />
    </div>
    <InkThreadPopover />
  </InkRoot>
</template>
