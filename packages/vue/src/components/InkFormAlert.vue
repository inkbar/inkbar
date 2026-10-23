<script setup lang="ts">
/*
 * A form script's `app.alert`: the message and OK, shown without blocking (no overlay, not
 * modal), so the form stays usable around it. InkViewport mounts it; hosts compose nothing.
 * OK, or Escape while focus is in the alert, closes it, and focus goes back where it was. A
 * press outside leaves it open, and Escape anywhere else stays with the viewer. A new message
 * replaces the one shown.
 */
import { FORM_LABELS } from '@inkbar/core/dom'
import {
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, nextTick, useTemplateRef, watch } from 'vue'

const props = defineProps<{
  /** The message to show (text, not markup); `null` while none is. */
  message: string | null
  /** Counts the times a message was shown, so the same text shown again takes focus again. */
  shown: number
  /** Where focus goes when nothing it can return to is left. */
  fallback?: HTMLElement | null | undefined
}>()
const emit = defineEmits<{ close: [] }>()

const open = computed(() => props.message !== null)
const ok = useTemplateRef<HTMLButtonElement>('ok')
/** Where focus was when the alert opened. */
let returnTo: HTMLElement | null = null

watch(
  () => props.message !== null,
  (isOpen) => {
    if (!isOpen) return
    const active = document.activeElement
    returnTo = active instanceof HTMLElement && active !== document.body ? active : null
  },
  { flush: 'sync', immediate: true }
)
// Another message while one shows: OK takes focus again.
watch(
  () => props.shown,
  () => void nextTick(() => ok.value?.focus({ preventScroll: true }))
)

function onOpenAutoFocus(e: Event): void {
  e.preventDefault()
  ok.value?.focus({ preventScroll: true })
}

/** Set while closing from inside the alert, which is when focus goes back. */
let hadFocus = false
function close(): void {
  const content = ok.value?.closest('[data-ink-form-alert]')
  hadFocus = !!content?.contains(document.activeElement)
  emit('close')
}

function onCloseAutoFocus(e: Event): void {
  e.preventDefault()
  if (!hadFocus) return
  hadFocus = false
  const back = returnTo?.isConnected === true ? returnTo : (props.fallback ?? null)
  back?.focus({ preventScroll: true })
}

function onEscape(e: KeyboardEvent): void {
  const content = ok.value?.closest('[data-ink-form-alert]')
  if (!(e.target instanceof Node) || !content?.contains(e.target)) {
    e.preventDefault()
    return
  }
  e.preventDefault()
  close()
}

function onOpenChange(next: boolean): void {
  if (!next) close()
}

// Reka's typed props stop at its own; ARIA goes through a bound object.
const contentAttrs = { role: 'alertdialog' }
</script>

<template>
  <DialogRoot :open="open" :modal="false" @update:open="onOpenChange">
    <DialogPortal>
      <DialogContent
        class="ink-dialog ink-form-alert"
        data-ink-form-alert
        v-bind="contentAttrs"
        @open-auto-focus="onOpenAutoFocus"
        @close-auto-focus="onCloseAutoFocus"
        @interact-outside.prevent
        @escape-key-down="onEscape"
      >
        <DialogTitle class="ink-dialog-title">{{ FORM_LABELS.alert }}</DialogTitle>
        <!-- Set as text, without the whitespace a template would add around it. -->
        <DialogDescription as-child>
          <p
            class="ink-form-alert-message"
            data-ink-form-alert-message
            v-text="props.message"
          />
        </DialogDescription>
        <div class="ink-dialog-actions">
          <button
            ref="ok"
            type="button"
            class="ink-button"
            data-variant="primary"
            data-ink-form-alert-ok
            @click="close"
          >
            {{ FORM_LABELS.ok }}
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
