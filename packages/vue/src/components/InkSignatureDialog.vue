<script setup lang="ts">
/*
 * "Create signature": a modal with Draw, Type and Image tabs. Draw is a pad with the draw
 * tool's renderer; Type sets a name in one of the host's handwriting fonts; Image takes a PNG
 * or JPEG scan. Save stores the template through InkRoot's signature store and, unless `select`
 * is false or no `signature` tool is registered, selects it for that tool. Escape, Cancel or a
 * press outside closes it.
 */
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'

import { useMessages } from '../composables/useMessages'

import SignatureForm from './SignatureForm.vue'

import type { SignatureTemplate } from '@inkbar/core'

const props = withDefaults(
  defineProps<{
    /** The fonts the Type tab offers. Default: InkRoot's `signatureFonts`. */
    fonts?: readonly string[] | undefined
    /**
     * Whether saving selects the new signature for the `signature` tool, when one is
     * registered. False leaves the tool alone, for a dialog that signs a field with it through
     * `save`.
     */
    select?: boolean
  }>(),
  { fonts: undefined, select: true }
)
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  /** The new template, once saved (and selected, with `select`). */
  save: [template: SignatureTemplate]
  /** Reka's close auto-focus; prevent it to place focus yourself. */
  closeAutoFocus: [event: Event]
}>()

// Reka's typed props stop at its own; ARIA goes through a bound object. No description: the
// title says it all.
const messages = useMessages()
const contentAttrs = { 'aria-modal': 'true', 'aria-describedby': undefined }

function onOpenAutoFocus(e: Event): void {
  e.preventDefault()
  ;(e.target as HTMLElement | null)
    ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    ?.focus({ preventScroll: true })
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="ink-dialog-overlay" data-ink-dialog-overlay />
      <DialogContent
        class="ink-dialog ink-signature-dialog"
        data-ink-signature-dialog
        v-bind="contentAttrs"
        @open-auto-focus="onOpenAutoFocus"
        @close-auto-focus="emit('closeAutoFocus', $event)"
      >
        <DialogTitle class="ink-dialog-title">{{
          messages.signature.dialog
        }}</DialogTitle>
        <SignatureForm
          :fonts="props.fonts"
          :select="props.select"
          @saved="emit('save', $event)"
          @close="open = false"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
