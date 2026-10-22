<script setup lang="ts">
/*
 * The signature menu for a signature field, opened from the field's "Sign" button and anchored
 * to its box. It lists the saved signatures and "Create signature", as `InkSignatureMenu`
 * does. Picking one signs the field with it (`signField`); a signature made in
 * `InkSignatureDialog` signs the field once saved, without picking the signature tool. Focus
 * returns to the field. InkViewport mounts it; hosts compose nothing.
 */
import { InkError, signField, type SignatureTemplate } from '@inkbar/core'
import {
  focusInitialMenuItem,
  SIGNATURE_LABELS,
  signatureMenuModel,
} from '@inkbar/core/dom'
import { PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, ref } from 'vue'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import InkSignatureDialog from './InkSignatureDialog.vue'
import SignatureMenuPanel from './SignatureMenuPanel.vue'

import type { SignFieldRequest } from '@inkbar/core/dom'

const props = defineProps<{
  /** The field to sign; `null` while the menu is closed. */
  request: SignFieldRequest | null
}>()
const emit = defineEmits<{ close: [] }>()

const NO_TEMPLATES: readonly SignatureTemplate[] = []

const ctx = useInkContext('InkSignFieldPopover')
const templates = useReadable(() => ctx.signatures.value.templates, NO_TEMPLATES)
// No signature is "chosen" here: each signing picks its own.
const model = computed(() => signatureMenuModel(templates.value, {}))
const open = computed(() => props.request !== null)
/** The field the dialog signs once its signature is saved. */
const creatingFor = ref<SignFieldRequest | null>(null)
const creating = computed({
  get: () => creatingFor.value !== null,
  set: (next) => {
    if (!next) creatingFor.value = null
  },
})
/** The request the menu last opened for, kept to return focus once it closes. */
let last: SignFieldRequest | null = null
/** Set while the menu closes for the dialog, which takes focus instead of the field. */
let toDialog = false

const control = (req: SignFieldRequest | null): HTMLElement | null =>
  req?.anchor.querySelector<HTMLElement>('button.ink-form-control') ?? null

/** Signs the request's field with `t`; a refusal (signed, read-only by now) goes to `error`. */
function sign(req: SignFieldRequest, t: SignatureTemplate): void {
  const doc = ctx.document.value
  if (!doc) return
  try {
    signField(doc, req.field, req.widget, t)
  } catch (e) {
    if (!(e instanceof InkError)) throw e
    ctx.reportError(e)
  }
}

function choose(t: SignatureTemplate): void {
  const req = props.request
  emit('close')
  if (req) sign(req, t)
}

function create(): void {
  toDialog = true
  creatingFor.value = props.request
  emit('close')
}

function onSaved(t: SignatureTemplate): void {
  const req = creatingFor.value
  if (req) sign(req, t)
}

function onOpenAutoFocus(e: Event): void {
  e.preventDefault()
  last = props.request
  // An old removal error is not news when the menu opens again.
  ctx.signatures.value.clearRemoveError()
  const menu = (e.target as HTMLElement | null)?.querySelector<HTMLElement>(
    '[role="menu"]'
  )
  if (menu) focusInitialMenuItem(menu)
}

function onCloseAutoFocus(e: Event): void {
  e.preventDefault()
  if (!toDialog) control(last)?.focus({ preventScroll: true })
  toDialog = false
}

function onDialogCloseAutoFocus(e: Event): void {
  e.preventDefault()
  control(last)?.focus({ preventScroll: true })
}

function onOpenChange(next: boolean): void {
  if (!next) emit('close')
}

// Reka's typed props stop at its own; ARIA goes through a bound object.
const menuAttrs = { 'aria-label': SIGNATURE_LABELS.menu }
</script>

<template>
  <PopoverRoot :open="open" @update:open="onOpenChange">
    <PopoverPortal>
      <PopoverContent
        v-if="props.request"
        :reference="props.request.anchor"
        class="ink-select-content ink-menu-content"
        data-ink-select-content
        data-ink-menu="signature"
        :data-ink-sign-field-menu="props.request.field"
        side="bottom"
        align="start"
        :side-offset="4"
        :collision-padding="8"
        v-bind="menuAttrs"
        @open-auto-focus="onOpenAutoFocus"
        @close-auto-focus="onCloseAutoFocus"
      >
        <SignatureMenuPanel :items="model.items" @choose="choose" @create="create" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
  <InkSignatureDialog
    v-model:open="creating"
    :select="false"
    @save="onSaved"
    @close-auto-focus="onDialogCloseAutoFocus"
  />
</template>
