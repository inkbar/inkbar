<script setup lang="ts">
/*
 * A fixture whose pages, thumbnails and loupes the engine draws, and whose text, links and
 * outline it reads: the route turned core's switch on before this mounted. The status names the
 * reader, for the tests.
 */
import { allTools } from '@inkbar/core/dom'
import { readerOf } from '@inkbar/e2e-shared/engine-reader'
import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import {
  InkFindBar,
  InkOutline,
  InkPanel,
  InkRoot,
  InkShapeMenu,
  InkSidebar,
  InkThumbnails,
  InkToolbar,
  InkToolButton,
  InkViewport,
  InkZoomIn,
} from '@inkbar/vue'
import { assets } from 'virtual:inkbar-assets'
import { computed, ref } from 'vue'

import type { InkDocument } from '@inkbar/core'

const props = defineProps<{ fixture: string }>()

const engine = () => import('@inkbar/engine')
const tools = allTools()
const src = computed(() => ({
  url: fixtureUrl(props.fixture as FixtureName),
  key: props.fixture,
}))
const status = ref('loading')
const reader = ref('')

function onReady(doc: InkDocument): void {
  reader.value = readerOf(doc)
  status.value = 'ready'
}
</script>

<template>
  <InkRoot
    :src="src"
    :assets="assets"
    :engine="engine"
    :tools="tools"
    class="sandbox-root"
    @ready="onReady"
    @error="status = 'error'"
  >
    <InkToolbar>
      <InkToolButton tool="select-text" />
      <InkShapeMenu />
      <InkZoomIn />
    </InkToolbar>
    <div style="display: flex; flex: 1 1 auto; min-height: 0">
      <InkSidebar side="left">
        <InkPanel id="outline" label="Outline">
          <InkOutline />
        </InkPanel>
        <InkPanel id="thumbnails" label="Thumbnails">
          <InkThumbnails />
        </InkPanel>
      </InkSidebar>
      <div class="sandbox-editor" style="flex: 1 1 auto; min-width: 0">
        <InkViewport />
        <InkFindBar />
      </div>
    </div>
    <p class="sandbox-status" role="status" data-testid="status" :data-reader="reader">
      {{ status }}
    </p>
  </InkRoot>
</template>
