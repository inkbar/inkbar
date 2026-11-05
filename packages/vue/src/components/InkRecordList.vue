<script
  setup
  lang="ts"
  generic="T extends RecordBase & { page: number } = RecordBase & { page: number }"
>
/*
 * The records a plugin keeps under `records` (`<plugin>.<name>`) as a list of cards, the same
 * cards their marks open, with the same actions: `createRecordList` on core's record list
 * controller. The list, the marks and `useRecordSelection` share one selection. `card`, `where`
 * and `sort` replace the marks' card, filter and reading order; changing one rebuilds the list,
 * so pass functions defined once rather than inline. `update:count` gives the number listed
 * whenever it changes; the `empty` slot replaces "Nothing here yet.". It fills its parent's
 * height. Inside `InkRoot`; it renders empty on the server.
 */
import { recordsSource, type CardSpec, type RecordsSourceOptions } from '@inkbar/core/dom'
import { computed } from 'vue'

import { injectInkContext } from '../context'
import { toReadable } from '../to-readable'

import RecordCards from './RecordCards.vue'

import type { RecordBase } from '@inkbar/core'

const props = defineProps<{
  records: string
  card?: ((record: T) => CardSpec) | undefined
  where?: ((record: T) => boolean) | undefined
  sort?: ((a: T, b: T) => number) | undefined
}>()

defineEmits<{ 'update:count': [count: number] }>()

defineSlots<{ empty?(): unknown }>()

const ctx = injectInkContext()
const viewport = toReadable(() => ctx.viewport.value)

const source = computed(() => {
  const pluginHost = ctx.pluginHost.value
  if (!pluginHost) return null
  const opts: RecordsSourceOptions<T> = {}
  if (props.card) opts.card = props.card
  if (props.where) opts.where = props.where
  if (props.sort) opts.sort = props.sort
  return recordsSource<T>({ pluginHost, viewport }, props.records, opts)
})
</script>

<template>
  <RecordCards :source="source" @update:count="$emit('update:count', $event)">
    <template v-if="$slots.empty" #empty><slot name="empty" /></template>
  </RecordCards>
</template>
