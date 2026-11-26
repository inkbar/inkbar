<script setup lang="ts">
/*
 * A fixture with its thumbnails and outline beside the pages, and the shape tools, which
 * draw loupes.
 */
import { allTools } from '@inkbar/core/dom'
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

const props = defineProps<{ fixture: string }>()

const tools = allTools()
const src = computed(() => ({
  url: fixtureUrl(props.fixture as FixtureName),
  key: props.fixture,
}))
const status = ref('loading')

function onReady(): void {
  status.value = 'ready'
}
</script>

<template>
  <InkRoot
    :src="src"
    :assets="assets"
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
    <p class="sandbox-status" role="status" data-testid="status">
      {{ status }}
    </p>
  </InkRoot>
</template>
