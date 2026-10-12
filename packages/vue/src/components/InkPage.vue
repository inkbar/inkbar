<script setup lang="ts">
/*
 * One mounted page: canvas, text layer and annotation overlay from core's `createPageMount`,
 * in the host element the viewport created. Renders nothing itself except, when the host
 * provides the `annotation` slot, one Teleport per annotation into its overlay element.
 *
 * The overlay creates and removes those elements as the annotation list changes, outside
 * Vue. So the teleport targets come from a list read after every overlay render: this
 * component subscribes to the store after the overlay does, and core notifies subscribers
 * in order, so the elements already exist when the list arrives here.
 *
 * A page whose canvas or text layer fails gets `data-state="error"` on its host and the
 * `page-error` slot teleported into it; the other pages and the viewport carry on. It clears
 * once every layer that failed (canvas, text layer) has since succeeded, for example after a
 * zoom change, or on the next mount of the page.
 */
import { InkError, isInkError } from '@inkbar/core'
import {
  createPageMount,
  type PageLayer,
  type PageMount,
  type PageTransform,
} from '@inkbar/core/dom'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

import { injectInkContext } from '../context'

import InkAnnotation from './InkAnnotation.vue'

import type { AnnotationSlotProps } from './annotation-slot'
import type { Annotation } from '@inkbar/core'

const props = withDefaults(
  defineProps<{
    page: number
    host: HTMLElement
    transform: PageTransform
    /** Fixed for the life of the mount: InkViewport remounts the page when it changes. */
    customAnnotations?: boolean
  }>(),
  { customAnnotations: false }
)

defineSlots<{
  annotation?(props: AnnotationSlotProps): unknown
  'page-error'?(props: { error: InkError; page: number }): unknown
}>()

const ctx = injectInkContext()
const mount = shallowRef<PageMount | null>(null)
const targets = shallowRef<{ annotation: Annotation; el: HTMLElement }[]>([])
let stopList: (() => void) | undefined
const pageError = shallowRef<InkError | null>(null)
/** Layers that have failed and not yet recovered; the error clears when this empties. */
const failedLayers = new Set<PageLayer>()

/** The first failure wins: a canvas and a text layer failing together report one error. */
function onPageError(cause: unknown, layer: PageLayer): void {
  failedLayers.add(layer)
  if (pageError.value) return
  pageError.value = isInkError(cause)
    ? cause
    : new InkError(
        'InvalidPdf',
        cause instanceof Error ? cause.message : String(cause),
        { page: props.page },
        cause
      )
  props.host.setAttribute('data-state', 'error')
}

function onPageRendered(layer: PageLayer): void {
  failedLayers.delete(layer)
  if (!pageError.value || failedLayers.size > 0) return
  pageError.value = null
  props.host.removeAttribute('data-state')
}

function readTargets(): void {
  const m = mount.value
  const doc = ctx.document.value
  if (!m || !doc || !props.customAnnotations) return
  targets.value = doc.annotations.byPage(props.page).flatMap((annotation) => {
    const el = m.overlay.elementFor(annotation.id)
    return el ? [{ annotation, el }] : []
  })
}

onMounted(() => {
  const doc = ctx.document.value
  if (!doc) return
  const custom = props.customAnnotations
  mount.value = createPageMount({
    document: doc,
    page: props.page,
    host: props.host,
    transform: props.transform,
    store: doc.annotations,
    onActivate: (id) => ctx.setActivated(id),
    isCustom: () => custom,
    onError: onPageError,
    onRendered: onPageRendered,
  })
  if (custom) {
    stopList = doc.annotations.list.subscribe(readTargets)
    readTargets()
  }
})

watch(
  () => props.transform,
  (t) => mount.value?.update(t)
)

onBeforeUnmount(() => {
  stopList?.()
  targets.value = []
  mount.value?.destroy()
  mount.value = null
  if (pageError.value) props.host.removeAttribute('data-state')
  pageError.value = null
  failedLayers.clear()
})

defineExpose({ mount })
</script>

<template>
  <Teleport v-if="pageError" :to="host">
    <div class="ink-page-error" data-ink-page-error role="alert">
      <slot name="page-error" :error="pageError" :page="page">
        <p>Page {{ page + 1 }} could not be shown.</p>
        <code class="ink-error-code">{{ pageError.code }}</code>
      </slot>
    </div>
  </Teleport>
  <Teleport v-for="t in targets" :key="t.annotation.id" :to="t.el">
    <InkAnnotation :annotation="t.annotation" :element="t.el">
      <template #default="slotProps">
        <slot name="annotation" v-bind="slotProps" />
      </template>
    </InkAnnotation>
  </Teleport>
</template>
