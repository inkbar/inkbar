<script setup lang="ts">
/*
 * Review card for a suggested redaction: opens when the activated annotation, or the only
 * selected one, is a redaction with `origin: 'suggested'`. Locked suggestions cannot be
 * dismissed, so they get no Dismiss button. A press on the overlay selects and
 * activates, so a click opens it whatever the tool. Closing clears `activated` and the
 * selection.
 */
import { confidenceBucket } from '@inkbar/core'
import { PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed } from 'vue'

import { useAnnotations } from '../composables/useAnnotations'
import { injectInkContext } from '../context'

import { useAnnotationElement } from './annotation-element'
import { keepOpenOnAnnotation, useFocusReturn } from './popover-focus'

import type { ConfidenceBucket, RedactAnnotation } from '@inkbar/core'
import type { SuggestionCardSlotProps } from '@inkbar/core/dom'

export type { ConfidenceBucket } from '@inkbar/core'

export type { SuggestionCardSlotProps } from '@inkbar/core/dom'

defineSlots<{ default?(props: SuggestionCardSlotProps): unknown }>()

const ctx = injectInkContext()
const {
  annotations,
  selection,
  accept: acceptId,
  dismiss: dismissId,
  select,
} = useAnnotations()

function suggestion(id: string | null | undefined): RedactAnnotation | null {
  const a = id ? annotations.value.find((x) => x.id === id) : undefined
  return a?.type === 'redact' && a.origin === 'suggested' ? a : null
}
// The activated annotation when it is a suggestion; otherwise the only selected one (a
// marquee selects without activating).
const target = computed<RedactAnnotation | null>(
  () =>
    suggestion(ctx.activated.value) ??
    (selection.value.length === 1 ? suggestion(selection.value[0]) : null)
)
const anchor = useAnnotationElement(
  ctx,
  computed(() => target.value?.id ?? null)
)
const focusReturn = useFocusReturn(ctx)
const open = computed(() => target.value !== null && anchor.value !== null)
const bucket = computed<ConfidenceBucket | undefined>(() =>
  target.value?.suggestion
    ? confidenceBucket(target.value.suggestion.confidence)
    : undefined
)

function close(): void {
  ctx.setActivated(null)
  select([])
}
function accept(): void {
  if (target.value) acceptId(target.value.id)
  close()
}
/** Locked annotations cannot be removed: dismissing one does nothing and keeps the card. */
function dismiss(): void {
  const t = target.value
  if (!t || t.locked) return
  focusReturn.beforeRemove(anchor.value, '[data-origin="suggested"]')
  dismissId(t.id)
  close()
}
function onOpenChange(next: boolean): void {
  if (!next) close()
}
</script>

<template>
  <PopoverRoot :open="open" @update:open="onOpenChange">
    <PopoverPortal>
      <PopoverContent
        v-if="target && anchor"
        :reference="anchor"
        class="ink-suggestion-card"
        data-ink-suggestion-card
        side="bottom"
        :side-offset="6"
        :collision-padding="8"
        v-bind="{ 'aria-label': 'Suggested redaction' }"
        @interact-outside="keepOpenOnAnnotation"
        @close-auto-focus="focusReturn.onCloseAutoFocus($event, anchor)"
      >
        <slot
          :annotation="target"
          :suggestion="target.suggestion"
          :bucket="bucket"
          :accept="accept"
          :dismiss="dismiss"
          :close="close"
        >
          <p class="ink-suggestion-reason">
            <strong>{{ target.suggestion?.reason ?? 'Suggested redaction' }}</strong>
            <span
              v-if="bucket"
              class="ink-suggestion-confidence"
              :data-confidence="bucket"
            >
              {{ bucket }} confidence
            </span>
          </p>
          <p v-if="target.suggestion?.explanation" class="ink-suggestion-explanation">
            {{ target.suggestion.explanation }}
          </p>
          <div class="ink-suggestion-actions">
            <button type="button" @click="accept">Accept</button>
            <button v-if="!target.locked" type="button" @click="dismiss">Dismiss</button>
          </div>
        </slot>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
