<script setup lang="ts">
/*
 * A document whose stopped flag the test sets, as `window.__setStopped(true)`. The flag stands in
 * for the engine reader's `engineStopped`: the harness swaps it in when the root says the
 * document is ready, before the viewport mounts, so the viewer follows it as it would a real
 * stop. Nothing actually stops: the file is read by PDF.js. The codes of the errors the root
 * emits show in `errors`.
 */
import { ref } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import type { DocumentSource, InkDocument, InkError, PdfAssets } from '@inkbar/core'
import type {} from './stopped'

defineProps<{ src: DocumentSource; assets: PdfAssets }>()

/** A boolean store with the document's `engineStopped` shape. */
function flag() {
  let value = false
  const subs = new Set<(v: boolean) => void>()
  return {
    get: () => value,
    subscribe(fn: (v: boolean) => void) {
      subs.add(fn)
      return () => {
        subs.delete(fn)
      }
    },
    set(next: boolean) {
      if (next === value) return
      value = next
      for (const fn of [...subs]) fn(value)
    },
  }
}

const errors = ref<string[]>([])
const onError = (e: InkError) => errors.value.push(e.code)
function onReady(doc: InkDocument): void {
  const stopped = flag()
  Object.defineProperty(doc, 'engineStopped', { value: stopped })
  window.__setStopped = (on) => stopped.set(on)
}
</script>

<template>
  <InkRoot :src="src" :assets="assets" :zoom="1" @ready="onReady" @error="onError">
    <!-- Test-only box: the scroll container needs a bounded height. -->
    <div style="height: 400px; width: 600px"><InkViewport /></div>
    <output data-testid="errors">{{ errors.join(' ') }}</output>
  </InkRoot>
</template>
