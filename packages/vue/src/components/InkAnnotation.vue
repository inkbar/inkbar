<script setup lang="ts">
/*
 * Slot props for one annotation. It renders only its default slot: the overlay already draws
 * the default visual for every annotation that is not custom, so this never draws a second
 * one. InkPage teleports it into the annotation's overlay element.
 */
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'

import { injectInkContext } from '../context'

import type { AnnotationSlotProps, AnnotationState } from './annotation-slot'
import type { Annotation } from '@inkbar/core'

const props = withDefaults(
  defineProps<{
    annotation: Annotation
    /** The overlay element; its `data-state` (which includes hover) drives `state`. */
    element?: HTMLElement | undefined
  }>(),
  { element: undefined }
)

defineSlots<{ default?(props: AnnotationSlotProps): unknown }>()

const ctx = injectInkContext()

const observed = shallowRef<AnnotationState | null>(null)
let observer: MutationObserver | undefined
function readState(el: HTMLElement): AnnotationState | null {
  const s = el.dataset.state
  return s === 'idle' || s === 'hover' || s === 'selected' ? s : null
}
watch(
  () => props.element,
  (el) => {
    observer?.disconnect()
    observer = undefined
    observed.value = el ? readState(el) : null
    if (!el) return
    observer = new MutationObserver(() => {
      observed.value = readState(el)
    })
    observer.observe(el, { attributes: true, attributeFilter: ['data-state'] })
  },
  { immediate: true }
)
onBeforeUnmount(() => observer?.disconnect())

const slotProps = computed<AnnotationSlotProps>(() => {
  const { id } = props.annotation
  const store = () => ctx.document.value?.annotations
  return {
    annotation: props.annotation,
    state: observed.value ?? (ctx.selection.value.includes(id) ? 'selected' : 'idle'),
    locked: props.annotation.locked === true,
    select: () => store()?.select([id]),
    remove: () => void store()?.remove(id),
  }
})
</script>

<template>
  <slot v-bind="slotProps" />
</template>
