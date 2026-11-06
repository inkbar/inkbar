<script setup lang="ts">
/*
 * The pages as a list of thumbnails: `createThumbnails`' markup on core's thumbnails
 * controller, which holds the current page, the keys, the clicks, the Tab stop and the window.
 * Only the items near the visible part are mounted, each placed at its offset over a spacer of
 * the full height, and each holds an `InkThumbnail`. An item is a button that scrolls the
 * viewport to its page; the current page's has `aria-current="page"`.
 *
 * `pages` lists 0-based pages in order (default: all). The `item` slot, given `{ page, current }`,
 * renders inside each item after its number. The item's height is fixed from the page's, so
 * keep what you add out of the flow (position it absolutely) or small. Inside `InkRoot`; it
 * renders empty on the server.
 */
import {
  createThumbnailsController,
  type ThumbnailsController,
  type ThumbnailsOptions,
  type ThumbnailsState,
} from '@inkbar/core/dom'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'

import { injectInkContext } from '../context'
import { toReadable } from '../to-readable'

import InkThumbnail from './InkThumbnail.vue'

const props = withDefaults(
  defineProps<{
    pages?: readonly number[] | undefined
    width?: number | undefined
    annotations?: boolean
    marks?: boolean
  }>(),
  { pages: undefined, width: undefined, annotations: true, marks: true }
)

defineSlots<{
  item?(props: { page: number; current: boolean }): unknown
}>()

const ctx = injectInkContext()
const deps = {
  document: toReadable(() => ctx.document.value),
  pluginHost: toReadable(() => ctx.pluginHost.value),
  viewport: toReadable(() => ctx.viewport.value),
}
const options = (): ThumbnailsOptions => ({
  pages: props.pages,
  width: props.width,
  annotations: props.annotations,
  marks: props.marks,
})

const state = shallowRef<ThumbnailsState>({
  pages: [],
  current: -1,
  window: { start: 0, end: 0 },
  offsets: [0],
})
const items = computed(() => {
  const { pages, current, window, offsets } = state.value
  return pages.slice(window.start, window.end).map((page, k) => {
    const top = offsets[window.start + k]!
    const bottom = offsets[window.start + k + 1]!
    return { page, current: page === current, top, height: bottom - top }
  })
})

const scroller = useTemplateRef<HTMLElement>('scroller')
let controller: ThumbnailsController | null = null
let stopState: (() => void) | null = null
onMounted(() => {
  const c = createThumbnailsController(deps, options())
  controller = c
  state.value = c.state.get()
  stopState = c.state.subscribe((s) => {
    state.value = s
  })
  watch(options, (next) => c.update(next))
  c.attach(scroller.value!)
})
onBeforeUnmount(() => {
  stopState?.()
  stopState = null
  controller?.destroy()
  controller = null
})
</script>

<template>
  <div ref="scroller" class="ink-thumbnails" data-ink-thumbnails role="list">
    <div
      class="ink-thumbnails-spacer"
      aria-hidden="true"
      :style="{ height: `${state.offsets.at(-1) ?? 0}px` }"
    />
    <div
      v-for="item in items"
      :key="item.page"
      class="ink-thumbnails-entry"
      role="listitem"
      :style="{ top: `${item.top}px`, height: `${item.height}px` }"
    >
      <!-- The controller sets the tabindex. The thumbnail names the button "Page N"; the
           visible number repeats it. -->
      <button
        type="button"
        class="ink-thumbnails-item"
        :data-ink-thumbnail-item="item.page"
        :aria-current="item.current ? 'page' : undefined"
      >
        <InkThumbnail
          :page="item.page"
          :width="width"
          :annotations="annotations"
          :marks="marks"
        />
        <span class="ink-thumbnails-label" aria-hidden="true">{{ item.page + 1 }}</span>
        <slot name="item" :page="item.page" :current="item.current" />
      </button>
    </div>
  </div>
</template>
