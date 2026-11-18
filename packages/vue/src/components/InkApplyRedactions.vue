<script setup lang="ts">
/*
 * Applies the open document's redaction marks, as `useRedaction().apply` does: asks first
 * (InkRoot's `redactionConfirm`), removes the content under them and shows the redacted file.
 * Disabled until the document is ready, was opened with InkRoot's `engine` and holds a mark.
 * While the marks are applied the button says so and is `aria-busy` and `aria-disabled`,
 * keeping focus, and a press does nothing. `disabled` turns it off whatever the state. The
 * slot receives `{ label, busy, disabled }`, for a host's own content or, with `asChild`, its
 * own element.
 */
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useMessages } from '../composables/useMessages'
import { useRedaction } from '../composables/useRedaction'

const props = withDefaults(defineProps<{ asChild?: boolean; disabled?: boolean }>(), {
  asChild: false,
  disabled: false,
})
defineSlots<{
  default?(props: { label: string; busy: boolean; disabled: boolean }): unknown
}>()

const { canRedact, busy, apply } = useRedaction()
const messages = useMessages()
const label = computed(() =>
  busy.value ? messages.value.viewer.redacting : messages.value.viewer.applyRedactions
)
const disabled = computed(() => props.disabled || (!canRedact.value && !busy.value))
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const attrs = computed(() => ({
  type: 'button',
  'aria-busy': String(busy.value),
  // Disabled while it applies, but not `disabled`, so the button keeps focus.
  'aria-disabled': busy.value ? 'true' : undefined,
  onClick: () => void apply(),
}))
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    :disabled="disabled"
    class="ink-apply-redactions"
    data-ink-apply-redactions
    v-bind="attrs"
  >
    <slot :label="label" :busy="busy" :disabled="disabled">{{ label }}</slot>
  </ToolbarButton>
</template>
