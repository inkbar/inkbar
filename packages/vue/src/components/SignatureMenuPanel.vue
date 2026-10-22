<script setup lang="ts">
/*
 * The panel both signature menus show: the saved signatures as previews, each with a remove
 * button, then "Create signature". `InkSignatureMenu` picks a signature for the tool with it;
 * `InkSignFieldPopover` signs a field with it.
 */
import { handleMenuKeys, SIGNATURE_LABELS, signaturePreview } from '@inkbar/core/dom'
import { Plus, Trash2 } from '@inkbar/icons'
import { computed, nextTick, useTemplateRef } from 'vue'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import InkIcon from './InkIcon.vue'

import type { SignatureTemplate } from '@inkbar/core'
import type { SignatureMenuItem } from '@inkbar/core/dom'

const props = defineProps<{ items: readonly SignatureMenuItem[] }>()
const emit = defineEmits<{ choose: [template: SignatureTemplate]; create: [] }>()

const ctx = useInkContext('SignatureMenuPanel')
const removeError = useReadable(() => ctx.signatures.value.removeError, undefined)
const root = useTemplateRef<HTMLElement>('root')

/** A saved signature drawn small: ink as filled outlines. */
const previews = computed(() =>
  props.items.map((item) =>
    item.template.kind === 'ink' ? signaturePreview(item.template) : null
  )
)

/** Removes a template; focus moves to the signature now in its row, else "Create signature". */
function remove(id: string, row: number): void {
  ctx.signatures.value.remove(id).then(
    async () => {
      await nextTick()
      const menu = root.value
      if (!menu) return
      const rows = menu.querySelectorAll<HTMLElement>('.ink-signature-item')
      const next =
        rows[Math.min(row, rows.length - 1)] ??
        menu.querySelector<HTMLElement>('[data-ink-signature-create]')
      next?.focus({ preventScroll: true })
    },
    () => {
      // The host's store refused: the signature stays.
    }
  )
}

const innerAttrs = {
  role: 'menu',
  'aria-label': SIGNATURE_LABELS.menu,
  onKeydown: (e: KeyboardEvent) => handleMenuKeys(e, e.currentTarget as HTMLElement),
}
</script>

<template>
  <div ref="root" v-bind="innerAttrs">
    <template v-if="props.items.length > 0">
      <div
        role="group"
        :aria-label="SIGNATURE_LABELS.saved"
        class="ink-signature-list"
        data-ink-menu-columns="2"
      >
        <template v-for="(item, row) in props.items" :key="item.id">
          <button
            type="button"
            role="menuitemradio"
            :aria-checked="item.checked"
            :aria-label="item.label"
            tabindex="-1"
            class="ink-select-item ink-menu-item ink-signature-item"
            data-ink-select-item
            :data-key="item.id"
            :data-state="item.checked ? 'checked' : 'unchecked'"
            @click="emit('choose', item.template)"
          >
            <span class="ink-signature-preview" :data-kind="item.template.kind">
              <img
                v-if="item.template.kind === 'image'"
                :src="item.template.imagedata"
                alt=""
                draggable="false"
              />
              <svg v-else :viewBox="previews[row]?.viewBox" aria-hidden="true">
                <path
                  v-for="(d, i) in previews[row]?.paths ?? []"
                  :key="i"
                  :d="d"
                  fill="currentColor"
                />
              </svg>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            :aria-label="item.removeLabel"
            :title="item.removeLabel"
            tabindex="-1"
            class="ink-menu-item ink-signature-remove"
            data-ink-signature-remove
            :data-key="item.id"
            @click="remove(item.id, row)"
          >
            <InkIcon :icon="Trash2" :size="16" />
          </button>
        </template>
      </div>
      <div role="separator" class="ink-select-separator" />
    </template>
    <button
      type="button"
      role="menuitem"
      tabindex="-1"
      class="ink-select-item ink-menu-item ink-signature-create"
      data-ink-select-item
      data-ink-signature-create
      @click="emit('create')"
    >
      <InkIcon :icon="Plus" :size="16" />
      {{ SIGNATURE_LABELS.create }}
    </button>
    <p
      v-if="removeError"
      class="ink-field-error ink-signature-remove-error"
      role="alert"
      data-ink-signature-remove-error
    >
      {{ removeError }}
    </p>
  </div>
</template>
