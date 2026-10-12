<script setup lang="ts">
/*
 * Review card for a suggested redaction: opens when the activated annotation, or the only
 * selected one, is a redaction with `origin: 'suggested'`. A press on the overlay selects and
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

import type { RedactAnnotation, Suggestion } from '@inkbar/core'

export type ConfidenceBucket = ReturnType<typeof confidenceBucket>

export interface SuggestionCardSlotProps {
  annotation: RedactAnnotation
  suggestion: Suggestion | undefined
  bucket: ConfidenceBucket | undefined
  accept: () => void
  dismiss: () => void
  close: () => void
}

defineSlots<{ default?(props: SuggestionCardSlotProps): unknown }>()

const ctx = injectInkContext()
const {
  annotations,
  selection,
  accept: acceptId,
  dismiss: dismissId,
  select,
} = useAnnotations()

const target = computed<RedactAnnotation | null>(() => {
  const id =
    ctx.activated.value ?? (selection.value.length === 1 ? selection.value[0] : undefined)
  const a = id ? annotations.value.find((x) => x.id === id) : undefined
  return a?.type === 'redact' && a.origin === 'suggested' ? a : null
})
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
function dismiss(): void {
  if (target.value) {
    focusReturn.beforeRemove(anchor.value, '[data-origin="suggested"]')
    dismissId(target.value.id)
  }
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
            <button type="button" @click="dismiss">Dismiss</button>
          </div>
        </slot>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
