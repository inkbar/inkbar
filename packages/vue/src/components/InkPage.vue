<script setup lang="ts">
/*
 * One page the viewer engine mounted. Renders nothing in place; Teleports go into the host
 * (page error) and, when the host provides the `annotation` slot, into each annotation's
 * overlay element.
 *
 * The overlay creates and removes those elements as the annotation list changes, outside
 * Vue. So the teleport targets come from a list read after every overlay render: this
 * component subscribes to the store after the overlay does (the engine created the mount
 * first), and core notifies subscribers in order, so the elements already exist when the list
 * arrives here.
 *
 * The engine tracks page errors and sets `data-state="error"` on the host; this component
 * teleports the `page-error` slot into it while `error` is set.
 */
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

import { injectInkContext } from '../context'

import InkAnnotation from './InkAnnotation.vue'

import type { AnnotationSlotProps } from './annotation-slot'
import type { Annotation, InkError } from '@inkbar/core'
import type { PageMount } from '@inkbar/core/dom'

const props = withDefaults(
  defineProps<{
    page: number
    host: HTMLElement
    /** The engine's page mount in `host`. */
    mount: PageMount
    /** The engine's error for this page, `null` while it renders. */
    error: InkError | null
    /** Fixed for the life of the mount: the engine rebuilds when it changes. */
    customAnnotations?: boolean
  }>(),
  { customAnnotations: false }
)

defineSlots<{
  annotation?(props: AnnotationSlotProps): unknown
  'page-error'?(props: { error: InkError; page: number }): unknown
}>()

const ctx = injectInkContext()
const targets = shallowRef<{ annotation: Annotation; el: HTMLElement }[]>([])
let stopList: (() => void) | undefined

function stop(): void {
  stopList?.()
  stopList = undefined
  targets.value = []
}

// Targets are read from the current mount, and read again when InkViewport hands this page a
// new one (the page left and came back within one tick, under the same key), as React and
// Svelte do. The watch fires only when one of these values changes, not on an error change.
function start(): void {
  stop()
  const doc = ctx.document.value
  if (!doc || !props.customAnnotations) return
  const mount = props.mount
  const read = (): void => {
    targets.value = doc.annotations.byPage(props.page).flatMap((annotation) => {
      const el = mount.overlay.elementFor(annotation.id)
      return el ? [{ annotation, el }] : []
    })
  }
  stopList = doc.annotations.list.subscribe(read)
  read()
}

onMounted(() => {
  start()
  watch([() => props.mount, () => props.page, () => props.customAnnotations], start)
})

onBeforeUnmount(stop)
</script>

<template>
  <Teleport v-if="error" :to="host">
    <div class="ink-page-error" data-ink-page-error role="alert">
      <slot name="page-error" :error="error" :page="page">
        <p>Page {{ page + 1 }} could not be shown.</p>
        <code class="ink-error-code">{{ error.code }}</code>
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
