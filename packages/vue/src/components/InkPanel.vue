<script setup lang="ts">
/*
 * One panel of an `InkSidebar`, holding your content in its default slot. `id` names it in
 * `v-model:open`, `label` names its trigger, `icon` (an `@inkbar/icons` node) shows on the rail,
 * and `badge` (a count or short text) shows beside it, hidden when empty or 0. Closed, the panel
 * stays mounted and hidden. In a stack it renders its own header above its content.
 */
import { resolveLabel } from '@inkbar/core'
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

import { useMessages } from '../composables/useMessages'

import { injectSidebarContext } from './sidebar-context'
import SidebarTrigger from './SidebarTrigger.vue'

import type { Label } from '@inkbar/core'
import type { SidebarPanelInfo } from '@inkbar/core/dom'
import type { IconNode } from '@inkbar/icons'

const props = defineProps<{
  id: string
  /** A string, or a function read again whenever the root's `messages` change. */
  label: Label
  icon?: IconNode | undefined
  badge?: string | number | undefined
}>()

const ctx = injectSidebarContext()
const messages = useMessages()
/** The label on screen, read again on new messages. */
const title = computed(() => {
  void messages.value
  return resolveLabel(props.label)
})
const wrapper = useTemplateRef<HTMLElement>('wrapper')

const info = (): SidebarPanelInfo => ({
  id: props.id,
  label: props.label,
  ...(props.icon !== undefined && { icon: props.icon }),
  ...(props.badge !== undefined && { badge: props.badge }),
})
// Registered now, so the server renders this panel's attributes; ordered once in the DOM.
const unregister = ctx.register({ info, element: () => wrapper.value })
onMounted(() => ctx.arrange())
onBeforeUnmount(unregister)

const view = computed(() => {
  const s = ctx.state.value
  return {
    stack: s.layout === 'stack',
    trigger: ctx.controller.triggerAttrs(props.id),
    panel: ctx.controller.panelAttrs(props.id),
  }
})
</script>

<template>
  <!-- A section in a stack; in rail and tabs the theme leaves the layout to the panel. Kept in
       every layout, so the content is never remounted. -->
  <div ref="wrapper" :class="['ink-sidebar-slot', { 'ink-sidebar-section': view.stack }]">
    <button v-if="view.stack" class="ink-sidebar-header" v-bind="view.trigger">
      <SidebarTrigger :panel="info()" :rail="false" />
    </button>
    <div class="ink-sidebar-panel" v-bind="view.panel">
      <!-- The rail button names the panel for assistive technology; this repeats it on screen. -->
      <div class="ink-sidebar-panel-title" aria-hidden="true">{{ title }}</div>
      <div class="ink-sidebar-panel-body"><slot /></div>
    </div>
  </div>
</template>
