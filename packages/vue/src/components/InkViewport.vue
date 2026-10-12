<script setup lang="ts">
/*
 * The scroll element is handed to core's `createViewport` and `createToolController`; Vue
 * never renders children into it. Pages are InkPage components rendered here (they render
 * nothing in place) that mount core's page layers into the hosts the viewport creates.
 * Keyboard shortcuts are core's `attachViewportKeys` on the scroll element.
 *
 * Two-way zoom and page: the viewport's own changes are reported through the context, and
 * the host's v-model values are applied only when they differ from the viewport's state, so
 * the echo of a reported value does nothing.
 */
import {
  attachViewportKeys,
  createToolController,
  createViewport,
  getSelectionQuads,
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

import InkPage from './InkPage.vue'

import type { AnnotationSlotProps } from './annotation-slot'
import type { InkDocument, InkError } from '@inkbar/core'
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
/** The document the viewport was built for, and the zoom and page last reported to the host. */
let builtFor: InkDocument | null = null
let lastReportedZoom: ZoomValue | undefined
let lastReportedPage: number | undefined

function teardown(): void {
  for (const stop of stops) stop()
  stops = []
  tools?.destroy()
  viewport?.destroy()
  tools = null
  viewport = null
  if (ctx.viewport.value) ctx.viewport.value = null
  if (ctx.tools.value) ctx.tools.value = null
  pages.value = []
}

function setup(): void {
  // Rebuilding for the same document (a gap or buffer change) keeps where the reader was.
  const carry =
    viewport && builtFor === ctx.document.value
      ? { zoom: viewport.zoom.get(), page: viewport.currentPage.get() }
      : null
  teardown()
  const doc = ctx.document.value
  const el = scroll.value
  if (!carry) {
    builtFor = null
    lastReportedZoom = undefined
    lastReportedPage = undefined
  }
  if (!doc || !el || ctx.status.value.state !== 'ready') return
  const vp = createViewport({
    container: el,
    document: doc,
    zoom: carry?.zoom ?? ctx.zoomModel.value ?? 'fit-width',
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
  // Every successful build records its document, so each later rebuild carries state too.
  builtFor = doc
  if (!carry) {
    // A new document starts from where the viewport opens; only later changes are reported.
    lastReportedZoom = vp.zoom.get()
    lastReportedPage = vp.currentPage.get()
  }
  const page = carry?.page ?? ctx.pageModel.value
  if (page !== undefined && page !== vp.currentPage.get()) vp.scrollToPage(page)
  const reportZoom = (z: ZoomValue): void => {
    if (z === lastReportedZoom) return
    lastReportedZoom = z
    ctx.reportZoom(z)
  }
  const reportPage = (p: number): void => {
    if (p === lastReportedPage) return
    lastReportedPage = p
    ctx.reportPage(p)
  }
  stops = [
    attachViewportKeys(el, { viewport: vp, pageCount: () => doc.pages.length }),
    vp.zoom.subscribe(reportZoom),
    vp.currentPage.subscribe(reportPage),
  ]
  // Whatever the restore changed is reported once; nothing is when it matched.
  reportZoom(vp.zoom.get())
  reportPage(vp.currentPage.get())
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
