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
 * `InkRoot`. The server renders the root, the panels (the open one shown), the stack headers
 * and the resize handle; rail and tab buttons follow once mounted, as the panels register
 * after the root has rendered.
 *
 * The handle on the inner edge resizes the sidebar. Its width is saved in `storage`, under
 * `sidebar.<name>.width`; inside `InkRoot` the root's storage is the default. `v-model:width`
 * makes the width the host's: drags and keys then only update the model, and storage is not
 * read or written.
 *
 * Once mounted, a rail's open panel floats over the pages while the document beside it would
 * be narrower than `minDocumentWidth` (InkRoot's inside it), and a tap on the pages or Escape
 * closes it. The server renders it beside the document, open as usual; once mounted, an unbound
 * sidebar with no room closes its panel.
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

import { useMessages } from '../composables/useMessages'
import { injectInkContext } from '../context'
import { useReadable } from '../use-readable'

import { provideSidebarContext, type SidebarPanelEntry } from './sidebar-context'
import SidebarTrigger from './SidebarTrigger.vue'

import type { InkStorage, Label } from '@inkbar/core'

const props = withDefaults(
  defineProps<{
    side?: SidebarSide | undefined
    layout?: SidebarLayout | undefined
    /** Default true. False hides the whole sidebar and keeps its open panel, content and scroll for when it shows again. */
    visible?: boolean | undefined
    /**
     * Where the width is saved. Default: InkRoot's `storage` inside InkRoot, else none, and the
     * width lasts until unmount. Read once, when the sidebar is created.
     */
    storage?: InkStorage | undefined
    /**
     * The middle of the saved key, `sidebar.<name>.width`. Default: the side. Give two sidebars
     * on one side different names. Read once, when the sidebar is created.
     */
    name?: string | undefined
    /** In CSS px. Default 320; Enter or a double-click on the handle goes back to it. */
    defaultWidth?: number | undefined
    /** Default 240. */
    minWidth?: number | undefined
    /** Default 480. */
    maxWidth?: number | undefined
    /**
     * Bind with `v-model:width` to control the width, in CSS px. Left unbound, the sidebar
     * keeps its own, saved in `storage`.
     */
    width?: number | undefined
    /**
     * The narrowest the document may get beside the sidebars sharing this one's parent, in CSS
     * px, before a rail's open panel floats over the pages. Tabs and stack narrow toward
     * `minWidth` instead. Default: InkRoot's `minDocumentWidth` inside InkRoot, else 480. Read
     * once, when the sidebar is created.
     */
    minDocumentWidth?: number | undefined
    /**
     * The resize handle's accessible name: a string, or a function read again whenever the
     * root's `messages` change. Default `Resize left sidebar` or `Resize right sidebar`, in the
     * root's words.
     */
    handleLabel?: Label | undefined
  }>(),
  {
    side: 'left',
    layout: 'rail',
    visible: true,
    storage: undefined,
    name: undefined,
    defaultWidth: undefined,
    minWidth: undefined,
    maxWidth: undefined,
    width: undefined,
    minDocumentWidth: undefined,
    handleLabel: undefined,
  }
)
// A prop and an event rather than `defineModel`: unbound, a model keeps the last width locally
// and would hand it back as a controlled one, and the width would no longer be saved.
const emit = defineEmits<{ 'update:width': [width: number] }>()
/** Undefined while unbound and untouched: the controller then opens the first panel. */
const open = defineModel<SidebarOpen | undefined>('open')

const entries = shallowRef<readonly SidebarPanelEntry[]>([])
const panels = computed(() => entries.value.map((e) => e.info()))

// Read once: the controller loads the saved width as it is created.
const ink = injectInkContext(null)
const messages = useMessages()
/** The handle's default name, in the root's words (English outside a root). */
const defaultHandleLabel = (): string =>
  props.side === 'right'
    ? messages.value.sidebar.resizeRight
    : messages.value.sidebar.resizeLeft
const storage = props.storage ?? ink?.storage
const minDocumentWidth = props.minDocumentWidth ?? ink?.minDocumentWidth
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
  ...(storage && { storage }),
  ...(props.name !== undefined && { name: props.name }),
  ...(minDocumentWidth !== undefined && { minDocumentWidth }),
  ...(props.handleLabel !== undefined && { handleLabel: props.handleLabel }),
  // The root's words, so the default handle names and tab badges follow its `messages`.
  ...(ink && { messages: ink.messageState }),
  ...widthOptions(),
  onWidthChange: (value) => emit('update:width', value),
  // The same ids on the server and the client.
  idPrefix: useId(),
})
// Sync, so a panel set up next reads the attributes its registration gives (on the server too).
watch(
  () =>
    [
      props.layout,
      props.side,
      props.visible,
      panels.value,
      open.value,
      widthOptions(),
      props.handleLabel,
    ] as const,
  ([layout, side, visible, list, value, widths, handleLabel]) =>
    controller.update({
      layout,
      side,
      visible,
      panels: list,
      // Core keeps the last label for an undefined one, so a dropped label is replaced by the
      // default, read afresh each time the words change.
      handleLabel: handleLabel ?? defaultHandleLabel,
      ...(value !== undefined && { open: value }),
      ...widths,
    }),
  { flush: 'sync' }
)
const state = useReadable(controller.state, controller.state.get())

/** The width props the host gave; an undefined one keeps the controller's. */
function widthOptions(): Partial<
  Record<'defaultWidth' | 'minWidth' | 'maxWidth' | 'width', number>
> {
  const { defaultWidth, minWidth, maxWidth, width } = props
  return {
    ...(defaultWidth !== undefined && { defaultWidth }),
    ...(minWidth !== undefined && { minWidth }),
    ...(maxWidth !== undefined && { maxWidth }),
    ...(width !== undefined && { width }),
  }
}

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

// The panels register after this component has rendered. So the server's and the first
// render's handle is shown, as the root is (`data-state` is open while pending), and the real
// `hidden` follows once mounted.
const mounted = shallowRef(false)

const view = computed(() => {
  const s = state.value
  const handle = controller.handleAttrs()
  if (!mounted.value) delete handle.hidden
  return {
    root: controller.rootAttrs(),
    style: controller.rootStyle(),
    panels: controller.panelsAttrs(),
    handle,
    tablist: controller.tablistAttrs(),
    triggers: s.panels.map((panel) => ({
      panel,
      attrs: controller.triggerAttrs(panel.id),
    })),
  }
})

const root = useTemplateRef<HTMLElement>('root')
const handle = useTemplateRef<HTMLElement>('handle')
// The controller handles the triggers' clicks and keys, stack headers included, and the
// handle's drags and keys. `destroy` unbinds them.
onMounted(() => {
  controller.bindTriggers(root.value!)
  controller.bindHandle(handle.value!)
  controller.update({ pending: false })
  mounted.value = true
  // Hydration keeps the server's markup: a width the client's storage gave applies here.
  for (const [name, value] of Object.entries(controller.rootStyle()))
    root.value!.style.setProperty(name, value)
  for (const [name, value] of Object.entries(controller.handleAttrs()))
    if (name.startsWith('aria-value')) handle.value!.setAttribute(name, value)
})
onBeforeUnmount(() => controller.destroy())
</script>

<template>
  <!-- The client's storage may hold another width than the server showed; see onMounted. -->
  <div
    ref="root"
    class="ink-sidebar"
    v-bind="view.root"
    :style="view.style"
    data-allow-mismatch="style"
  >
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
    <!-- The stack has no panels element: its id and class apply in rail and tabs only. -->
    <div
      :class="{ 'ink-sidebar-panels': state.layout !== 'stack' }"
      v-bind="state.layout !== 'stack' ? view.panels : {}"
    >
      <slot />
    </div>
    <!-- The last child, on the inner edge. -->
    <div
      ref="handle"
      class="ink-sidebar-handle"
      v-bind="view.handle"
      data-allow-mismatch="attribute"
    />
  </div>
</template>
