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
 */
import { createPageMount, type PageMount, type PageTransform } from '@inkbar/core/dom'
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

defineSlots<{ annotation?(props: AnnotationSlotProps): unknown }>()

const ctx = injectInkContext()
const mount = shallowRef<PageMount | null>(null)
const targets = shallowRef<{ annotation: Annotation; el: HTMLElement }[]>([])
let stopList: (() => void) | undefined

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
})

defineExpose({ mount })
</script>

<template>
  <Teleport v-for="t in targets" :key="t.annotation.id" :to="t.el">
    <InkAnnotation :annotation="t.annotation" :element="t.el">
      <template #default="slotProps">
        <slot name="annotation" v-bind="slotProps" />
      </template>
    </InkAnnotation>
  </Teleport>
</template>
