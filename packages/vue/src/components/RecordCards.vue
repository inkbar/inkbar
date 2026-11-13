<script setup lang="ts">
/*
 * A record list's markup on core's record list controller, shared by `InkRecordList` and
 * `InkSearchResults`: `createRecordList`'s `div.ink-records` holding `ul.ink-record-list` with
 * one `li.ink-record` card per row, the empty text and a polite live region. The controller
 * holds the rows, the count and the announcement, and handles the clicks, keys, Tab stop,
 * focus and scrolling. Empty, with no empty text, until there is a source.
 */
import { resolveLabel } from '@inkbar/core'
import {
  cardActions,
  createRecordListController,
  type RecordListController,
  type RecordListRow,
  type RecordListSource,
} from '@inkbar/core/dom'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'

import { injectInkContext } from '../context'

import type { Label } from '@inkbar/core'

const props = withDefaults(
  defineProps<{
    source: RecordListSource | null
    /** Whether the empty text shows when there are no rows. */
    emptyShown?: boolean
  }>(),
  { emptyShown: true }
)

const emit = defineEmits<{ 'update:count': [count: number] }>()

defineSlots<{ empty?(): unknown }>()

const ctx = injectInkContext()
/** A card's label, read again on new messages so a label function follows them. */
function label(text: Label | undefined): string {
  void ctx.messages.value
  return resolveLabel(text)
}

const root = useTemplateRef<HTMLElement>('root')
const controller = shallowRef<RecordListController | null>(null)
const rows = shallowRef<readonly RecordListRow[]>([])
const announcement = shallowRef('')
const empty = computed(
  () => controller.value !== null && rows.value.length === 0 && props.emptyShown
)

let reported: number | null = null
function report(count: number): void {
  if (count === reported) return
  reported = count
  emit('update:count', count)
}

/**
 * When the rows change under a focused action whose button goes (its card lost that action),
 * focus the same place in the card once it re-renders, else the row. A row that goes is the
 * controller's to re-home.
 */
function keepActionFocus(): void {
  const el = root.value
  const active = el?.ownerDocument.activeElement
  if (!el || !(active instanceof HTMLButtonElement) || !el.contains(active)) return
  const row = active.closest<HTMLElement>('[data-ink-record]')
  if (!row) return
  const id = row.dataset.inkRecord
  const buttons = (r: HTMLElement) => [
    ...r.querySelectorAll<HTMLElement>('.ink-card-actions > button'),
  ]
  const index = buttons(row).indexOf(active)
  void nextTick(() => {
    if (active.isConnected) return
    const now = [...el.querySelectorAll<HTMLElement>('[data-ink-record]')].find(
      (r) => r.dataset.inkRecord === id
    )
    if (now) (buttons(now)[index] ?? now).focus({ preventScroll: true })
  })
}

watch(
  [() => props.source, root],
  ([source, el], _, onCleanup) => {
    if (!source || !el) {
      controller.value = null
      rows.value = []
      announcement.value = ''
      return
    }
    const c = createRecordListController(source, ctx.messageState)
    controller.value = c
    rows.value = c.rows.get()
    announcement.value = c.announcement.get()
    report(c.count.get())
    const stops = [
      c.rows.subscribe((next) => {
        keepActionFocus()
        rows.value = next
      }),
      c.count.subscribe(report),
      c.announcement.subscribe((text) => {
        announcement.value = text
      }),
    ]
    const detach = c.attach(el)
    onCleanup(() => {
      for (const stop of stops) stop()
      detach()
      c.destroy()
    })
  },
  { flush: 'post', immediate: true }
)
</script>

<template>
  <div ref="root" class="ink-records" data-ink-records tabindex="-1">
    <ul class="ink-record-list" role="list" :hidden="rows.length === 0">
      <!-- The controller sets each row's tabindex. -->
      <li
        v-for="{ item, card, selected } in rows"
        :key="item.id"
        class="ink-record"
        :data-ink-record="item.id"
        :aria-current="selected ? 'true' : undefined"
        :data-selected="selected ? '' : undefined"
      >
        <div :class="['ink-card', card?.className]">
          <template v-if="card">
            <p class="ink-card-title">{{ label(card.title) }}</p>
            <!-- prettier-ignore -->
            <p v-if="card.meta !== undefined" class="ink-card-meta"><span v-if="card.swatch !== undefined" class="ink-card-swatch" :style="{ background: card.swatch }" />{{ card.meta }}</p>
            <p v-if="card.body !== undefined" class="ink-card-body">{{ card.body }}</p>
            <!-- prettier-ignore -->
            <p v-if="card.excerpt !== undefined" class="ink-card-excerpt">{{ card.excerpt.before }}<mark>{{ card.excerpt.match }}</mark>{{ card.excerpt.after }}</p>
            <div class="ink-card-actions">
              <button
                v-for="action in cardActions(card)"
                :key="action.key"
                type="button"
                @click="controller?.act(item.id, action.key)"
                v-text="label(action.label)"
              />
            </div>
          </template>
        </div>
      </li>
    </ul>
    <p class="ink-record-list-empty" :hidden="!empty">
      <slot name="empty">{{ ctx.messages.value.records.empty }}</slot>
    </p>
    <div
      class="ink-visually-hidden"
      aria-live="polite"
      data-ink-record-status
      v-text="announcement"
    />
  </div>
</template>
