<script setup lang="ts">
/*
 * The signature menu for a signature field, opened from the field's "Sign" button and anchored
 * to its box. It lists the saved signatures and "Create signature", as `InkSignatureMenu`
 * does. Picking one signs the field with it (`signField`); a signature made in
 * `InkSignatureDialog` signs the field once saved, without picking the signature tool. Focus
 * returns to the field. InkViewport mounts it, one per document; hosts compose nothing.
 */
import { InkError, signField, type SignatureTemplate } from '@inkbar/core'
import {
  focusInitialMenuItem,
  SIGNATURE_LABELS,
  signatureMenuModel,
  watchDetached,
} from '@inkbar/core/dom'
import { PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import InkSignatureDialog from './InkSignatureDialog.vue'
import SignatureMenuPanel from './SignatureMenuPanel.vue'

import type { InkDocument } from '@inkbar/core'
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
/** The field the dialog signs once its signature is saved, and the document it is in. */
const creatingFor = shallowRef<{ req: SignFieldRequest; doc: InkDocument } | null>(null)
const creating = computed({
  get: () => creatingFor.value !== null,
  set: (next) => {
    if (!next) creatingFor.value = null
  },
})
/**
 * The request the menu was last open for, kept to return focus once it closes. A request that
 * replaces the open one takes over, so focus returns to the field asked for last.
 */
let last: SignFieldRequest | null = null
/** Set while the menu closes for the dialog, which takes focus instead of the field. */
let toDialog = false
/** Cleared on unmount, so a dialog save that settles after the document went signs nothing. */
let alive = true
onBeforeUnmount(() => {
  alive = false
})

// The field's box went (its page unmounted, its layer rebuilt): the menu has nothing to stand
// by.
watch(
  () => props.request,
  (req, _, onCleanup) => {
    if (!req) return
    last = req
    onCleanup(watchDetached(req.anchor, () => emit('close')))
  },
  { immediate: true }
)

const control = (req: SignFieldRequest | null): HTMLElement | null =>
  req?.anchor.querySelector<HTMLElement>('button.ink-form-control') ?? null

/** Focus goes back to the field's button, or to the scroll element once the field's box has gone. */
function returnFocus(req: SignFieldRequest | null): void {
  const c = control(req)
  ;(c?.isConnected ? c : ctx.viewportEl.value)?.focus({ preventScroll: true })
}

/** Signs the request's field with `t`; a refusal (signed, read-only by now) goes to `error`. */
function sign(req: SignFieldRequest, doc: InkDocument, t: SignatureTemplate): void {
  // The document the request came from is still the open one.
  if (!alive || ctx.document.value !== doc) return
  try {
    signField(doc, req.field, req.widget, t)
  } catch (e) {
    if (!(e instanceof InkError)) throw e
    ctx.reportError(e)
  }
}

function choose(t: SignatureTemplate): void {
  const req = props.request
  const doc = ctx.document.value
  emit('close')
  if (req && doc) sign(req, doc, t)
}

function create(): void {
  const req = props.request
  const doc = ctx.document.value
  if (!req || !doc) return
  toDialog = true
  creatingFor.value = { req, doc }
  emit('close')
}

function onSaved(t: SignatureTemplate): void {
  const c = creatingFor.value
  if (c) sign(c.req, c.doc, t)
}

/**
 * A press on this field's own button toggles the menu through the engine; it must not also
 * close it here first, or the click would open it again.
 */
function onInteractOutside(e: CustomEvent<{ originalEvent: Event }>): void {
  const target = e.detail.originalEvent.target
  if (target instanceof Node && props.request?.anchor.contains(target)) e.preventDefault()
}

function onOpenAutoFocus(e: Event): void {
  e.preventDefault()
  // An old removal error is not news when the menu opens again.
  ctx.signatures.value.clearRemoveError()
  const menu = (e.target as HTMLElement | null)?.querySelector<HTMLElement>(
    '[role="menu"]'
  )
  if (menu) focusInitialMenuItem(menu)
}

function onCloseAutoFocus(e: Event): void {
  e.preventDefault()
  if (!toDialog) returnFocus(last)
  toDialog = false
}

function onDialogCloseAutoFocus(e: Event): void {
  e.preventDefault()
  returnFocus(last)
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
        @interact-outside="onInteractOutside"
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
