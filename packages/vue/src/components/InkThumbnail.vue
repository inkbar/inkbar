<script setup lang="ts">
/*
 * One page as a static image, with its live annotations and plugin marks: core's thumbnail
 * painter on this element, which sizes it, names it ("Page N" unless `label` says otherwise)
 * and draws it once it nears the visible area. `page` is 0-based. `width` (default `--ink-thumbnail-width`, px only, else 120) or
 * `height` sets the size; the other follows the page. It is not focusable and does nothing on
 * click: wrap it in the control you need. Inside `InkRoot`; it renders empty on the server.
 */
import {
  createThumbnailPainter,
  type ThumbnailOptions,
  type ThumbnailPainter,
} from '@inkbar/core/dom'
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

import { injectInkContext } from '../context'
import { toReadable } from '../to-readable'

import type { Label } from '@inkbar/core'

const props = withDefaults(
  defineProps<{
    page: number
    width?: number | undefined
    height?: number | undefined
    annotations?: boolean
    marks?: boolean
    /**
     * The accessible name: a string, or a function read again whenever the root's `messages`
     * change. Default "Page N" in the root's words.
     */
    label?: Label | undefined
  }>(),
  {
    width: undefined,
    height: undefined,
    annotations: true,
    marks: true,
    label: undefined,
  }
)

const ctx = injectInkContext()
const deps = {
  document: toReadable(() => ctx.document.value),
  pluginHost: toReadable(() => ctx.pluginHost.value),
  messages: ctx.messageState,
}
const options = (): ThumbnailOptions => ({
  page: props.page,
  width: props.width,
  height: props.height,
  annotations: props.annotations,
  marks: props.marks,
  label: props.label,
})

const el = useTemplateRef<HTMLElement>('el')
let painter: ThumbnailPainter | null = null
onMounted(() => {
  const p = createThumbnailPainter(el.value!, deps, options())
  painter = p
  watch(options, (next) => p.update(next))
})
onBeforeUnmount(() => {
  painter?.destroy()
  painter = null
})
</script>

<template>
  <!-- The class is the painter's too: kept here, a re-render never drops it. -->
  <div ref="el" class="ink-thumbnail" />
</template>
