<script setup lang="ts">
/*
 * A sidebar of `InkPanel`s: `createSidebar`'s markup on core's sidebar controller, which holds
 * the open state, the ARIA, the keys and the clicks. Rail and tabs render their triggers here;
 * in a stack each panel renders its own header. Panels register as they are set up and take
 * their place in DOM order once mounted, so a panel added later with `v-if` slots in where it
 * stands. A closed panel stays mounted and hidden, and the panels' content stays in place
 * across layouts, so its state survives switching.
 *
 * `v-model:open` is the open panel's id (or null) for rail and tabs, and the expanded ids for
 * stack. Left unbound, the first panel starts open. It needs no document, so it works outside
 * `InkRoot`. The server renders the root, the panels (the open one shown) and the stack
 * headers; rail and tab buttons follow once mounted, as the panels register after the root
 * has rendered.
 */
import {
  createSidebarController,
  type SidebarLayout,
  type SidebarOpen,
  type SidebarSide,
} from '@inkbar/core/dom'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue'

import { useReadable } from '../use-readable'

import { provideSidebarContext, type SidebarPanelEntry } from './sidebar-context'
import SidebarTrigger from './SidebarTrigger.vue'

const props = withDefaults(
  defineProps<{
    side?: SidebarSide | undefined
    layout?: SidebarLayout | undefined
    /** Default true. False hides the whole sidebar and keeps its open panel, content and scroll for when it shows again. */
    visible?: boolean | undefined
  }>(),
  { side: 'left', layout: 'rail', visible: true }
)
/** Undefined while unbound and untouched: the controller then opens the first panel. */
const open = defineModel<SidebarOpen | undefined>('open')

const entries = shallowRef<readonly SidebarPanelEntry[]>([])
const panels = computed(() => entries.value.map((e) => e.info()))

// Pending until mounted: the panels register one by one while they are set up, and an open id
// not registered yet is not a removed panel.
const controller = createSidebarController({
  layout: props.layout,
  side: props.side,
  visible: props.visible,
  panels: [],
  ...(open.value !== undefined && { open: open.value }),
  pending: true,
  onOpenChange: (value) => {
    open.value = value
  },
  // The same ids on the server and the client.
  idPrefix: useId(),
})
// Sync, so a panel set up next reads the attributes its registration gives (on the server too).
watch(
  () => [props.layout, props.side, props.visible, panels.value, open.value] as const,
  ([layout, side, visible, list, value]) =>
    controller.update({
      layout,
      side,
      visible,
      panels: list,
      ...(value !== undefined && { open: value }),
    }),
  { flush: 'sync' }
)
const state = useReadable(controller.state, controller.state.get())

function register(entry: SidebarPanelEntry): () => void {
  entries.value = [...entries.value, entry]
  return () => {
    entries.value = entries.value.filter((e) => e !== entry)
  }
}

function arrange(): void {
  const list = entries.value
  const sorted = [...list].sort((a, b) => {
    const x = a.element()
    const y = b.element()
    if (!x || !y || x === y) return 0
    return x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })
  if (sorted.some((e, i) => e !== list[i])) entries.value = sorted
}

provideSidebarContext({ controller, state, register, arrange })

const view = computed(() => {
  const s = state.value
  return {
    root: controller.rootAttrs(),
    tablist: controller.tablistAttrs(),
    triggers: s.panels.map((panel) => ({
      panel,
      attrs: controller.triggerAttrs(panel.id),
    })),
  }
})

const root = useTemplateRef<HTMLElement>('root')
// The controller handles the triggers' clicks and keys, stack headers included.
onMounted(() => {
  controller.bindTriggers(root.value!)
  controller.update({ pending: false })
})
onBeforeUnmount(() => controller.destroy())
</script>

<template>
  <div ref="root" class="ink-sidebar" v-bind="view.root">
    <div
      v-if="state.layout !== 'stack'"
      :class="state.layout === 'rail' ? 'ink-sidebar-rail' : 'ink-sidebar-tabs'"
      v-bind="view.tablist"
    >
      <button v-for="t in view.triggers" :key="t.panel.id" v-bind="t.attrs">
        <SidebarTrigger :panel="t.panel" :rail="state.layout === 'rail'" />
      </button>
    </div>
    <!-- One element in every layout, so the panels are never remounted. -->
    <div :class="{ 'ink-sidebar-panels': state.layout !== 'stack' }"><slot /></div>
  </div>
</template>
