<script setup lang="ts">
/*
 * "Password required": a modal that asks for the password of a locked file. InkViewport mounts
 * it and drives `open`, `incorrect` and `pending` from the password prompt; place your own to
 * build another flow. It holds no password beyond the field: Open hands the value to `submit`,
 * and the field is cleared when the dialog closes and after each wrong try. Escape, Cancel or a
 * press outside closes it.
 */
import { PASSWORD_LABELS } from '@inkbar/core/dom'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'

const props = defineProps<{
  /** The last try was wrong: shows the message. */
  incorrect: boolean
  /** A try is loading: Open is disabled until it ends. */
  pending: boolean
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  /** The typed password, for one load. */
  submit: [password: string]
  /** Reka's close auto-focus; prevent it to place focus yourself. */
  closeAutoFocus: [event: Event]
}>()

const uid = useId()
const inputId = `${uid}-input`
const errorId = `${uid}-error`
const input = useTemplateRef<HTMLInputElement>('input')
const value = ref('')
/** Counts the tries that came back wrong, to key the alert so each one is announced. */
const attempt = ref(0)
const disabled = computed(() => props.pending || value.value === '')

function focusInput(): void {
  void nextTick(() => input.value?.focus({ preventScroll: true }))
}

function onOpenAutoFocus(e: Event): void {
  e.preventDefault()
  input.value?.focus({ preventScroll: true })
}

function onSubmit(): void {
  if (disabled.value) return
  emit('submit', value.value)
}

// A try that ends wrong: a new alert, an empty field, focus back in it.
watch(
  () => props.pending,
  (now, was) => {
    if (was && !now && props.incorrect) {
      attempt.value++
      value.value = ''
      focusInput()
    }
  }
)
// Nothing typed outlives the dialog.
watch(open, (now) => {
  if (!now) value.value = ''
})
// Reopened or updated marked incorrect (the host's own wrong password) starts empty.
watch(
  () => props.incorrect,
  (now) => {
    if (now && !props.pending) value.value = ''
  }
)

// Reka's typed props stop at its own; ARIA goes through a bound object.
const contentAttrs = { 'aria-modal': 'true' }
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="ink-dialog-overlay" data-ink-dialog-overlay />
      <DialogContent
        class="ink-dialog ink-password-dialog"
        data-ink-password-dialog
        v-bind="contentAttrs"
        @open-auto-focus="onOpenAutoFocus"
        @close-auto-focus="emit('closeAutoFocus', $event)"
      >
        <DialogTitle class="ink-dialog-title">{{ PASSWORD_LABELS.dialog }}</DialogTitle>
        <DialogDescription class="ink-dialog-description">
          {{ PASSWORD_LABELS.description }}
        </DialogDescription>
        <form class="ink-password-form" data-ink-password-form @submit.prevent="onSubmit">
          <label class="ink-password-label" :for="inputId">{{
            PASSWORD_LABELS.field
          }}</label>
          <input
            :id="inputId"
            ref="input"
            v-model="value"
            class="ink-password-input"
            type="password"
            autocomplete="off"
            :aria-invalid="props.incorrect ? 'true' : 'false'"
            :aria-describedby="props.incorrect ? errorId : undefined"
          />
          <p
            v-if="props.incorrect"
            :id="errorId"
            :key="attempt"
            class="ink-password-error"
            role="alert"
          >
            {{ PASSWORD_LABELS.incorrect }}
          </p>
          <div class="ink-dialog-actions">
            <button type="button" class="ink-button" @click="open = false">
              {{ PASSWORD_LABELS.cancel }}
            </button>
            <button
              type="submit"
              class="ink-button"
              data-variant="primary"
              :disabled="disabled"
            >
              {{ PASSWORD_LABELS.submit }}
            </button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
