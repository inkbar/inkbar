<script setup lang="ts">
/*
 * SidebarHarness rendered to a string without a store, as a server would, then hydrated on the
 * client with `stored`: the client's store gives another width than the server showed. In a
 * narrow `containerWidth`, the client finds no room for the panel the server showed open.
 */
import {
  createSSRApp,
  onBeforeUnmount,
  onMounted,
  ref,
  type App,
  type Component,
} from 'vue'
import { renderToString } from 'vue/server-renderer'

import Harness from './SidebarHarness.vue'

import type { SidebarLayout } from '@inkbar/core/dom'

const props = defineProps<{
  layout?: SidebarLayout | undefined
  stored?: Record<string, unknown> | undefined
  containerWidth?: number | undefined
}>()

const host = ref<HTMLElement>()
const serverHtml = ref('')
// Typed loosely by the linter as a .vue import used as a value.
const SidebarHarness = Harness as Component
let app: App | undefined

onMounted(async () => {
  const html = await renderToString(
    createSSRApp(SidebarHarness, {
      layout: props.layout,
      stored: props.stored,
      containerWidth: props.containerWidth,
      withoutStore: true,
    })
  )
  host.value!.innerHTML = html
  serverHtml.value = html
  app = createSSRApp(SidebarHarness, {
    layout: props.layout,
    stored: props.stored,
    containerWidth: props.containerWidth,
  })
  app.mount(host.value!)
})
onBeforeUnmount(() => app?.unmount())
</script>

<template>
  <template v-if="serverHtml">
    <div data-testid="server-html" :data-html="serverHtml" hidden />
  </template>
  <div ref="host" />
</template>
