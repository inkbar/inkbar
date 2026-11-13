<script setup lang="ts">
import { computed } from 'vue'

import InkFindBar from '../../src/components/InkFindBar.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkSearchButton from '../../src/components/InkSearchButton.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import SearchProbe from './SearchProbe.vue'

import type { DocumentSource, InkMessagesInput, PdfAssets } from '@inkbar/core'

const callerAttrs: Record<string, string | boolean> = {
  'aria-label': 'Search the PDF',
  title: 'Search the PDF',
  disabled: false,
}

const props = withDefaults(
  defineProps<{
    src: DocumentSource | null
    assets: PdfAssets
    withBar?: boolean
    /** A `find.count` that throws, which a test cannot pass as a prop. */
    brokenCount?: boolean
    /** A `find.announce` starting with this word. */
    announceWord?: string | undefined
  }>(),
  { withBar: true, brokenCount: false, announceWord: undefined }
)
const words = computed<InkMessagesInput | undefined>(() => {
  if (!props.brokenCount && props.announceWord === undefined) return undefined
  const find: NonNullable<InkMessagesInput['find']> = {}
  if (props.brokenCount)
    find.count = () => {
      throw new Error('no words')
    }
  const word = props.announceWord
  if (word !== undefined)
    find.announce = ({ current, total, page }) => `${word} ${current}/${total} p${page}`
  return { find }
})
</script>

<template>
  <button type="button" data-testid="outside">Outside</button>
  <InkRoot :src="src" :assets="assets" :zoom="1" :messages="words">
    <InkToolbar>
      <!-- Its own label and not-ready state must win over these, which the types do not offer
           but the DOM takes. -->
      <InkSearchButton v-bind="callerAttrs" />
    </InkToolbar>
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 600px; width: 900px"><InkViewport /></div>
    <InkFindBar v-if="withBar" class="harness-find" data-testid="find-bar" />
    <SearchProbe />
  </InkRoot>
</template>
