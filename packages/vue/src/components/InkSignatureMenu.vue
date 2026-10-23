<script setup lang="ts">
/*
 * A split button for the signature tool. The main part activates the tool with the chosen
 * signature, or opens the menu when none is chosen; the chevron opens the saved signatures as
 * previews, each with a remove button, and "Create signature", which opens
 * `InkSignatureDialog`. Choosing a signature switches to the tool with it.
 */
import {
  focusInitialMenuItem,
  menuItems,
  SIGNATURE_LABELS,
  signatureMenuModel,
} from '@inkbar/core/dom'
import { ChevronDown, Signature } from '@inkbar/icons'
import {
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  ToolbarButton,
} from 'reka-ui'
import { computed, ref, useTemplateRef, watch } from 'vue'

import { useTool } from '../composables/useTool'
import { useToolOptions } from '../composables/useToolOptions'
import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import InkIcon from './InkIcon.vue'
import InkSignatureDialog from './InkSignatureDialog.vue'
import SignatureMenuPanel from './SignatureMenuPanel.vue'

import type { SignatureOptions, SignatureTemplate } from '@inkbar/core'

defineOptions({ inheritAttrs: false })
const props = defineProps<{
  /** The fonts the dialog's Type tab offers. Default: InkRoot's `signatureFonts`. */
  fonts?: readonly string[] | undefined
}>()

const NO_TEMPLATES: readonly SignatureTemplate[] = []

const { tool, setTool } = useTool()
const { options, setOptions } = useToolOptions<SignatureOptions>('signature')
const ctx = useInkContext('InkSignatureMenu')
const templates = useReadable(() => ctx.signatures.value.templates, NO_TEMPLATES)
const model = computed(() => signatureMenuModel(templates.value, options.value))
const active = computed(() => tool.value === 'signature')
const open = ref(false)
const creating = ref(false)
// An old removal error is not news when the menu opens again.
watch(open, (isOpen) => {
  if (isOpen) ctx.signatures.value.clearRemoveError()
})
const main = useTemplateRef<{ $el: HTMLElement }>('main')

/** ArrowDown opens on the first item; a click opens on the checked one. */
let focusFirst = false
/** Set while the menu closes for the dialog, which takes focus instead of the trigger. */
let toDialog = false

function onTriggerKeydown(e: KeyboardEvent): void {
  if (e.key !== 'ArrowDown' || e.defaultPrevented || open.value) return
  e.preventDefault()
  focusFirst = true
  open.value = true
}

// Not a signature field's menu, which shares the attribute.
const panel = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(
    '[data-ink-menu="signature"]:not([data-ink-sign-field-menu]) [role="menu"]'
  )

function onOpenAutoFocus(e: Event): void {
  e.preventDefault()
  const menu = panel()
  if (menu) {
    if (focusFirst) menuItems(menu)[0]?.focus({ preventScroll: true })
    else focusInitialMenuItem(menu)
  }
  focusFirst = false
}

function onCloseAutoFocus(e: Event): void {
  if (toDialog) e.preventDefault()
  toDialog = false
}

function onMain(): void {
  if (model.value.selected) setTool('signature')
  else open.value = true
}

function choose(id: string): void {
  setOptions({ templateId: id })
  setTool('signature')
  open.value = false
}

function create(): void {
  toDialog = true
  open.value = false
  creating.value = true
}

function onDialogCloseAutoFocus(e: Event): void {
  e.preventDefault()
  main.value?.$el.focus({ preventScroll: true })
}

// Reka's typed props stop at its own; ARIA and listeners go through bound objects.
const mainAttrs = computed(() => ({
  'aria-pressed': String(active.value),
  'aria-label': SIGNATURE_LABELS.sign,
  title: SIGNATURE_LABELS.sign,
  onClick: onMain,
}))
const triggerAttrs = {
  'aria-label': SIGNATURE_LABELS.trigger,
  title: SIGNATURE_LABELS.trigger,
  'aria-haspopup': 'menu' as const,
  onKeydown: onTriggerKeydown,
}
const menuAttrs = { 'aria-label': SIGNATURE_LABELS.menu }
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverAnchor as-child>
      <div
        role="group"
        :aria-label="SIGNATURE_LABELS.sign"
        class="ink-split-button ink-signature-menu"
        data-ink-signature-menu
        v-bind="$attrs"
      >
        <ToolbarButton
          ref="main"
          class="ink-tool-button ink-signature-button"
          data-ink-tool-button
          data-ink-signature-button
          data-tool="signature"
          :data-state="active ? 'on' : 'off'"
          v-bind="mainAttrs"
        >
          <slot :active="active"><InkIcon :icon="Signature" /></slot>
        </ToolbarButton>
        <ToolbarButton as-child>
          <PopoverTrigger as-child>
            <button
              type="button"
              class="ink-menu-trigger ink-signature-menu-trigger"
              data-ink-signature-menu-trigger
              :data-state="open ? 'open' : 'closed'"
              v-bind="triggerAttrs"
            >
              <InkIcon :icon="ChevronDown" />
            </button>
          </PopoverTrigger>
        </ToolbarButton>
        <PopoverPortal>
          <PopoverContent
            class="ink-select-content ink-menu-content"
            data-ink-select-content
            data-ink-menu="signature"
            side="bottom"
            align="start"
            :side-offset="4"
            :collision-padding="8"
            v-bind="menuAttrs"
            @open-auto-focus="onOpenAutoFocus"
            @close-auto-focus="onCloseAutoFocus"
          >
            <SignatureMenuPanel
              :items="model.items"
              @choose="choose($event.id)"
              @create="create"
            />
          </PopoverContent>
        </PopoverPortal>
        <InkSignatureDialog
          v-model:open="creating"
          :fonts="props.fonts"
          @close-auto-focus="onDialogCloseAutoFocus"
        />
      </div>
    </PopoverAnchor>
  </PopoverRoot>
</template>
