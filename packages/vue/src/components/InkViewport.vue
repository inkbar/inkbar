<script setup lang="ts">
/*
 * The scroll element is handed to core's `createViewport` and `createToolController`; Vue
 * never renders children into it. Pages are InkPage components rendered here (they render
 * nothing in place) that mount core's page layers into the hosts the viewport creates.
 *
 * Two-way zoom and page: the viewport's own changes are reported through the context, and
 * the host's v-model values are applied only when they differ from the viewport's state, so
 * the echo of a reported value does nothing.
 */
import { createToolController, createViewport, getSelectionQuads } from '@inkbar/core/dom'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'

import { injectInkContext } from '../context'

import InkPage from './InkPage.vue'

import type { AnnotationSlotProps } from './annotation-slot'
import type { InkError } from '@inkbar/core'
import type {
  LayoutMode,
  PageTransform,
  ToolController,
  ViewRotation,
  Viewport,
  ZoomValue,
} from '@inkbar/core/dom'

const props = withDefaults(
  defineProps<{
    mode?: LayoutMode
    rotation?: ViewRotation
    /** Gap between pages, CSS px. */
    gap?: number
    /** Pages kept mounted either side of the visible ones. */
    buffer?: number
  }>(),
  { mode: 'continuous', rotation: 0, gap: 16, buffer: 2 }
)

const slots = defineSlots<{
  loading?(): unknown
  error?(props: { error: InkError }): unknown
  empty?(): unknown
  annotation?(props: AnnotationSlotProps): unknown
}>()

const ctx = injectInkContext()
const scroll = useTemplateRef<HTMLElement>('scroll')

interface MountedPage {
  page: number
  host: HTMLElement
  transform: PageTransform
}
const pages = shallowRef<MountedPage[]>([])

const state = computed(() => ctx.status.value.state)
const error = computed<InkError | null>(() =>
  ctx.status.value.state === 'error' ? ctx.status.value.error : null
)

let viewport: Viewport | null = null
let tools: ToolController | null = null
let stops: (() => void)[] = []
let lastReportedPage: number | undefined

function teardown(): void {
  for (const stop of stops) stop()
  stops = []
  tools?.destroy()
  viewport?.destroy()
  tools = null
  viewport = null
  lastReportedPage = undefined
  if (ctx.viewport.value) ctx.viewport.value = null
  if (ctx.tools.value) ctx.tools.value = null
  pages.value = []
}

function setup(): void {
  teardown()
  const doc = ctx.document.value
  const el = scroll.value
  if (!doc || !el || ctx.status.value.state !== 'ready') return
  const vp = createViewport({
    container: el,
    document: doc,
    zoom: ctx.zoomModel.value ?? 'fit-width',
    mode: props.mode,
    rotation: props.rotation,
    gap: props.gap,
    buffer: props.buffer,
    onMount: (page, host, transform) => {
      pages.value = [...pages.value, { page, host, transform }]
    },
    onUpdate: (page, host, transform) => {
      pages.value = pages.value.map((m) =>
        m.page === page ? { page, host, transform } : m
      )
    },
    onUnmount: (page) => {
      pages.value = pages.value.filter((m) => m.page !== page)
    },
  })
  const tc = createToolController({
    initial: ctx.tool.value,
    ctx: {
      store: doc.annotations,
      viewport: vp,
      root: el,
      selectionQuads: () =>
        getSelectionQuads(el, (host) => {
          const page = Number(host.dataset.page)
          return { page, transform: vp.transformFor(page) }
        }),
      clearSelection: () =>
        el.ownerDocument.defaultView?.getSelection()?.removeAllRanges(),
      onActivate: (id) => ctx.setActivated(id),
    },
  })
  viewport = vp
  tools = tc
  ctx.viewport.value = vp
  ctx.tools.value = tc
  stops = [
    vp.zoom.subscribe((z) => ctx.reportZoom(z)),
    vp.currentPage.subscribe((p) => {
      lastReportedPage = p
      ctx.reportPage(p)
    }),
  ]
  const initialPage = ctx.pageModel.value
  if (initialPage !== undefined && initialPage !== vp.currentPage.get())
    vp.scrollToPage(initialPage)
}

onMounted(() => {
  watch([() => ctx.document.value, () => ctx.status.value.state], setup, {
    immediate: true,
  })
})

watch(
  () => ctx.zoomModel.value,
  (z: ZoomValue | undefined) => {
    if (viewport && z !== undefined && z !== viewport.zoom.get()) viewport.setZoom(z)
  }
)
watch(
  () => ctx.pageModel.value,
  (p) => {
    if (!viewport || p === undefined || p === lastReportedPage) return
    if (p !== viewport.currentPage.get()) viewport.scrollToPage(p)
  }
)
watch(
  () => ctx.tool.value,
  (t) => {
    if (tools && tools.active.get() !== t) tools.set(t)
  }
)
watch(
  () => props.mode,
  (m) => viewport?.setMode(m)
)
watch(
  () => props.rotation,
  (r) => viewport?.setRotation(r)
)
// Gap and buffer are construction options: rebuild the viewport when they change.
watch([() => props.gap, () => props.buffer], setup)

const IGNORE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-annotation]'

function onKeydown(e: KeyboardEvent): void {
  const vp = viewport
  const doc = ctx.document.value
  if (!vp || !doc || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.target instanceof Element && e.target.closest(IGNORE)) return
  switch (e.key) {
    case '+':
    case '=':
      vp.zoomBy(1.25)
      break
    case '-':
      vp.zoomBy(0.8)
      break
    case 'Home':
      vp.scrollToPage(0)
      break
    case 'End':
      vp.scrollToPage(doc.pages.length - 1)
      break
    case 'PageDown':
      vp.scrollToPage(vp.currentPage.get() + 1)
      break
    case 'PageUp':
      vp.scrollToPage(vp.currentPage.get() - 1)
      break
    default:
      return
  }
  e.preventDefault()
}

onBeforeUnmount(teardown)
</script>

<template>
  <div class="ink-viewport-root" data-ink-viewport-root :data-state="state">
    <div v-if="state === 'loading'" class="ink-status" role="status" aria-live="polite">
      <slot name="loading">Loading document…</slot>
    </div>
    <div v-else-if="error" class="ink-status ink-error" role="alert">
      <slot name="error" :error="error">
        <p class="ink-error-title">This document could not be opened.</p>
        <p>
          <code class="ink-error-code">{{ error.code }}</code>
          <span class="ink-error-message">{{ error.message }}</span>
        </p>
      </slot>
    </div>
    <div v-else-if="state === 'idle'" class="ink-status ink-empty">
      <slot name="empty" />
    </div>
    <div
      ref="scroll"
      class="ink-scroll"
      data-ink-scroll
      tabindex="0"
      role="document"
      aria-label="Document"
      @keydown="onKeydown"
    />
    <InkPage
      v-for="p in pages"
      :key="`${p.page}:${!!slots.annotation}`"
      :page="p.page"
      :host="p.host"
      :transform="p.transform"
      :custom-annotations="!!slots.annotation"
    >
      <template v-if="slots.annotation" #annotation="slotProps">
        <slot name="annotation" v-bind="slotProps" />
      </template>
    </InkPage>
  </div>
</template>
