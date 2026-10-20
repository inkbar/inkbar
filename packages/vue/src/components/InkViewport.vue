<script setup lang="ts">
/*
 * The scroll element is handed to core's `mountViewer`, which builds the viewport, the page
 * layers, the tool controller and the keyboard shortcuts in it; Vue never renders children
 * into it. The engine reports each page host it mounts, and InkPage components rendered here
 * (they render nothing in place) teleport the page-error and custom-annotation slots into them.
 *
 * Two-way zoom and page: the viewport's own changes are reported through the context, and
 * the host's v-model values are applied only when they differ from the viewport's state, so
 * the echo of a reported value does nothing.
 */
import { mountViewer } from '@inkbar/core/dom'
import {
  computed,
  onBeforeUnmount,
  onBeforeUpdate,
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
  PageMount,
  ViewerEngine,
  ViewRotation,
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
  /** Shown inside a page that failed to render. The rest of the document stays usable. */
  'page-error'?(props: { error: InkError; page: number }): unknown
}>()

const ctx = injectInkContext()
const scroll = useTemplateRef<HTMLElement>('scroll')

interface MountedPage {
  /** The engine build the host belongs to; part of the InkPage key. */
  build: number
  page: number
  host: HTMLElement
  mount: PageMount
  error: InkError | null
  /** Whether the build that mounted the page renders the annotation slot. */
  custom: boolean
}
/** Page hosts, mounts and errors the engine reported; InkPage renders Teleports for them. */
const pages = shallowRef<MountedPage[]>([])

const state = computed(() => ctx.status.value.state)
const error = computed<InkError | null>(() =>
  ctx.status.value.state === 'error' ? ctx.status.value.error : null
)

const engine = shallowRef<ViewerEngine | null>(null)
/**
 * Numbered before each build starts, so the pages a build mounts carry its own number. A
 * rebuild gives each page a new host and mount, so pages from an earlier build must remount,
 * not be reused.
 */
let build = 0
/** Whether the current build renders the annotation slot. */
let custom = false
let stops: (() => void)[] = []
/** The zoom and page last reported to the host. */
let lastReportedZoom: ZoomValue | undefined
let lastReportedPage: number | undefined

function teardown(): void {
  for (const stop of stops) stop()
  stops = []
  // Unmounts every page, which empties `pages` through `onPageUnmount`.
  engine.value?.destroy()
  engine.value = null
  if (ctx.viewport.value) ctx.viewport.value = null
  if (ctx.tools.value) ctx.tools.value = null
  pages.value = []
}

function rebuild(opts: Parameters<ViewerEngine['rebuild']>[0]): void {
  const e = engine.value
  if (!e) return
  build += 1
  if (opts.customAnnotations !== undefined) custom = opts.customAnnotations
  e.rebuild(opts)
}

// Build for a new document or status; the previous engine is torn down first.
function setup(): void {
  teardown()
  lastReportedZoom = undefined
  lastReportedPage = undefined
  const doc = ctx.document.value
  const el = scroll.value
  if (!doc || !el || ctx.status.value.state !== 'ready') return
  let first = true
  build += 1
  custom = !!slots.annotation
  engine.value = mountViewer({
    container: el,
    document: doc,
    zoom: ctx.zoomModel.value ?? 'fit-width',
    ...(ctx.pageModel.value === undefined ? {} : { page: ctx.pageModel.value }),
    mode: props.mode,
    rotation: props.rotation,
    gap: props.gap,
    buffer: props.buffer,
    tool: ctx.tool.value,
    ...(ctx.hostTools.value ? { tools: ctx.hostTools.value } : {}),
    ...(ctx.toolStyle.value ? { toolStyle: ctx.toolStyle.value } : {}),
    toolHistory: { batch: (fn) => ctx.history.batch(fn) },
    signatureLibrary: ctx.signatures.value,
    customAnnotations: custom,
    onActivate: (id) => ctx.setActivated(id),
    onBuild: (vp, tc) => {
      ctx.viewport.value = vp
      ctx.tools.value = tc
      if (first) {
        // A new document starts from where the viewport opens (its zoom, on the first page:
        // `createViewport` always starts at page 0); only later changes are reported, the
        // restored page among them, since the engine has already scrolled to it.
        first = false
        lastReportedZoom = vp.zoom.get()
        lastReportedPage = 0
      }
      for (const stop of stops) stop()
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
      stops = [vp.zoom.subscribe(reportZoom), vp.currentPage.subscribe(reportPage)]
      // Whatever the build restored is reported once; nothing is when it matched.
      reportZoom(vp.zoom.get())
      reportPage(vp.currentPage.get())
    },
    onPageMount: (page, mount, host) => {
      pages.value = [...pages.value, { build, page, host, mount, error: null, custom }]
    },
    onPageUnmount: (page) => {
      pages.value = pages.value.filter((p) => p.page !== page)
    },
    onPageError: (page, err) => {
      pages.value = pages.value.map((p) => (p.page === page ? { ...p, error: err } : p))
    },
  })
}

onMounted(() => {
  watch([() => ctx.document.value, () => ctx.status.value.state], setup, {
    immediate: true,
  })
})

watch(
  () => ctx.zoomModel.value,
  (z: ZoomValue | undefined) => {
    const vp = engine.value?.viewport
    if (vp && z !== undefined && z !== vp.zoom.get()) vp.setZoom(z)
  }
)
watch(
  () => ctx.pageModel.value,
  (p) => {
    const vp = engine.value?.viewport
    if (!vp || p === undefined || p === lastReportedPage) return
    if (p !== vp.currentPage.get()) vp.scrollToPage(p)
  }
)
watch(
  () => ctx.tool.value,
  (t) => {
    const tc = engine.value?.tools
    if (tc && tc.active.get() !== t) tc.set(t)
  }
)
watch(
  () => props.mode,
  (m) => engine.value?.viewport.setMode(m)
)
watch(
  () => props.rotation,
  (r) => engine.value?.viewport.setRotation(r)
)
// Gap and buffer are construction options: rebuild for the same document, keeping zoom and page.
// The slots are already updated when this runs, so it carries the annotation slot too: a slot
// toggle in the same tick is then recorded here and `onBeforeUpdate` finds nothing left to do.
watch([() => props.gap, () => props.buffer], ([gap, buffer]) =>
  rebuild({ gap, buffer, customAnnotations: !!slots.annotation })
)

// Slots are not reactive, so a change to whether the annotation slot is given is caught here.
// `onBeforeUpdate` runs after the new slots are in place and before this render: the rebuild
// swaps `pages` for the new build's pages synchronously, so the render that follows never pairs
// the annotation slot with an overlay built without it (or the reverse). The rebuild keeps the
// scroll position.
onBeforeUpdate(() => {
  const next = !!slots.annotation
  if (engine.value && next !== custom) rebuild({ customAnnotations: next })
})

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
        <!-- The message comes from the PDF engine and is not written for readers: it stays
             off the page, on the code's tooltip. -->
        <p>
          <code class="ink-error-code" :title="error.message">{{ error.code }}</code>
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
      :key="`${p.build}:${p.page}`"
      :page="p.page"
      :host="p.host"
      :mount="p.mount"
      :error="p.error"
      :custom-annotations="p.custom"
    >
      <template v-if="slots.annotation" #annotation="slotProps">
        <slot name="annotation" v-bind="slotProps" />
      </template>
      <template v-if="slots['page-error']" #page-error="slotProps">
        <slot name="page-error" v-bind="slotProps" />
      </template>
    </InkPage>
  </div>
</template>
