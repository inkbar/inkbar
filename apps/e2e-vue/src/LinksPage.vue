<script setup lang="ts">
/*
 * The outline and links fixtures, with the outline in a left sidebar and Back and Forward in
 * the toolbar. Actions reach `window.__actions`, since Inkbar never opens a URL itself; the
 * button swaps the document in place, as a host opening another file would.
 */
import { allTools } from '@inkbar/core/dom'
import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import {
  InkBack,
  InkForward,
  InkOutline,
  InkPageCount,
  InkPageInput,
  InkPanel,
  InkRoot,
  InkUndo,
  InkSidebar,
  InkToolbar,
  InkToolButton,
  InkViewport,
} from '@inkbar/vue'
import { assets } from 'virtual:inkbar-assets'
import { computed, ref } from 'vue'

import type { ViewerAction } from '@inkbar/core'

const props = defineProps<{ fixture: string }>()

const tools = allTools()
const name = ref(props.fixture)
const src = computed(() => ({
  url: fixtureUrl(name.value as FixtureName),
  key: name.value,
}))
const status = ref('loading')

function onAction(a: ViewerAction): void {
  ;(window.__actions ??= []).push(a)
}

function swap(): void {
  status.value = 'loading'
  name.value = name.value === 'outline' ? 'links' : 'outline'
}
</script>

<template>
  <InkRoot
    :src="src"
    :assets="assets"
    :tools="tools"
    :history="true"
    class="sandbox-root"
    @ready="status = 'ready'"
    @error="status = 'error'"
    @action="onAction"
  >
    <InkToolbar>
      <InkBack />
      <InkForward />
      <InkToolButton tool="select-text" />
      <InkToolButton tool="highlight" />
      <InkUndo />
      <button type="button" data-testid="swap" @click="swap">
        Open {{ name === 'outline' ? 'links' : 'outline' }}
      </button>
    </InkToolbar>
    <div style="display: flex; flex: 1 1 auto; min-height: 0">
      <InkSidebar side="left">
        <InkPanel id="outline" label="Outline">
          <InkOutline />
        </InkPanel>
      </InkSidebar>
      <div class="sandbox-editor" style="flex: 1 1 auto; min-width: 0">
        <InkViewport />
        <InkToolbar label="Page">
          <InkPageInput />
          <InkPageCount />
        </InkToolbar>
      </div>
    </div>
    <p class="sandbox-status" role="status" data-testid="status">{{ status }}</p>
  </InkRoot>
</template>
