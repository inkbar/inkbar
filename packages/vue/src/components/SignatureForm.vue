<script setup lang="ts">
/*
 * The body of `InkSignatureDialog`, mounted while it is open: one draft per opening. Draw,
 * Type and Image tabs, then Cancel and Save.
 */
import {
  createSignatureDraft,
  fontFamilyValue,
  handleRadioKeys,
  handleTabKeys,
  SIGNATURE_LABELS,
  SIGNATURE_TABS,
  type SignatureDraftState,
  type SignatureTab,
} from '@inkbar/core/dom'
import { DialogClose } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, useId, useTemplateRef } from 'vue'

import { useTool } from '../composables/useTool'
import { useToolOptions } from '../composables/useToolOptions'
import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { SignatureOptions, SignatureTemplate } from '@inkbar/core'

const props = defineProps<{ fonts?: readonly string[] | undefined }>()
const emit = defineEmits<{ saved: [template: SignatureTemplate]; close: [] }>()

const ctx = useInkContext('InkSignatureDialog')
const { setTool } = useTool()
const { setOptions } = useToolOptions<SignatureOptions>('signature')
const draft = createSignatureDraft({ fonts: props.fonts ?? ctx.signatureFonts.value })
const IDLE: SignatureDraftState = draft.state.get()
const s = useReadable(draft.state, IDLE)
const uid = useId()
const padHost = useTemplateRef<HTMLDivElement>('pad')

let detach: (() => void) | undefined
onMounted(() => {
  if (padHost.value) detach = draft.attachPad(padHost.value)
})
onBeforeUnmount(() => {
  detach?.()
  draft.destroy()
})

function save(): void {
  draft.save(ctx.signatures.value).then(
    (t) => {
      if (!t) return
      setOptions({ templateId: t.id })
      setTool('signature')
      emit('saved', t)
      emit('close')
    },
    () => {
      // The host's store refused it: the dialog stays open to try again.
    }
  )
}

const tabId = (tab: SignatureTab) => `${uid}-tab-${tab}`
const panelId = (tab: SignatureTab) => `${uid}-panel-${tab}`
const shown = computed(() => s.value.name.trim() || SIGNATURE_LABELS.namePlaceholder)
const onTabKeydown = (e: KeyboardEvent) =>
  handleTabKeys(e, e.currentTarget as HTMLElement)
const onRadioKeydown = (e: KeyboardEvent) =>
  handleRadioKeys(e, e.currentTarget as HTMLElement)
const onName = (e: Event) => draft.setName((e.target as HTMLInputElement).value)
const onFile = (e: Event) =>
  void draft.chooseFile((e.target as HTMLInputElement).files?.[0])
</script>

<template>
  <div
    role="tablist"
    :aria-label="SIGNATURE_LABELS.tabs"
    class="ink-tabs"
    @keydown="onTabKeydown"
  >
    <button
      v-for="tab in SIGNATURE_TABS"
      :id="tabId(tab)"
      :key="tab"
      type="button"
      role="tab"
      :aria-controls="panelId(tab)"
      :aria-selected="s.tab === tab"
      :tabindex="s.tab === tab ? 0 : -1"
      class="ink-tab"
      :data-key="tab"
      :data-state="s.tab === tab ? 'active' : 'inactive'"
      @click="draft.setTab(tab)"
    >
      {{ SIGNATURE_LABELS[tab] }}
    </button>
  </div>
  <div
    :id="panelId('draw')"
    role="tabpanel"
    :aria-labelledby="tabId('draw')"
    class="ink-tab-panel"
    data-key="draw"
    :hidden="s.tab !== 'draw'"
  >
    <div
      ref="pad"
      class="ink-signature-pad-host"
      data-ink-signature-pad-host
      role="img"
      :aria-label="SIGNATURE_LABELS.pad"
    />
    <div class="ink-dialog-row">
      <button
        type="button"
        class="ink-button"
        data-ink-signature-clear
        :disabled="s.padEmpty"
        @click="draft.clearPad()"
      >
        {{ SIGNATURE_LABELS.clear }}
      </button>
    </div>
  </div>
  <div
    :id="panelId('type')"
    role="tabpanel"
    :aria-labelledby="tabId('type')"
    class="ink-tab-panel"
    data-key="type"
    :hidden="s.tab !== 'type'"
  >
    <label class="ink-field">
      <span>{{ SIGNATURE_LABELS.name }}</span>
      <input
        type="text"
        class="ink-input"
        data-ink-signature-name
        autocomplete="name"
        :placeholder="SIGNATURE_LABELS.namePlaceholder"
        :value="s.name"
        @input="onName"
      />
    </label>
    <div
      role="radiogroup"
      :aria-label="SIGNATURE_LABELS.fonts"
      class="ink-signature-fonts"
      @keydown="onRadioKeydown"
    >
      <button
        v-for="font in draft.fonts"
        :key="font"
        type="button"
        role="radio"
        :aria-checked="s.font === font"
        :aria-label="font"
        :tabindex="s.font === font ? 0 : -1"
        class="ink-signature-font"
        :data-key="font"
        :data-state="s.font === font ? 'checked' : 'unchecked'"
        @click="draft.setFont(font)"
      >
        <!-- The font is the option itself, so it is set here, not left to the theme. -->
        <span
          class="ink-signature-font-sample"
          :style="{ fontFamily: fontFamilyValue(font) }"
        >
          {{ shown }}
        </span>
      </button>
    </div>
  </div>
  <div
    :id="panelId('image')"
    role="tabpanel"
    :aria-labelledby="tabId('image')"
    class="ink-tab-panel"
    data-key="image"
    :hidden="s.tab !== 'image'"
  >
    <label class="ink-field">
      <span>{{ SIGNATURE_LABELS.file }}</span>
      <input
        type="file"
        accept="image/png,image/jpeg"
        class="ink-input"
        data-ink-signature-file
        @change="onFile"
      />
    </label>
    <img
      v-if="s.image?.kind === 'image'"
      class="ink-signature-image"
      :src="s.image.imagedata"
      alt=""
    />
    <p v-if="s.imageError" class="ink-field-error" role="alert">{{ s.imageError }}</p>
  </div>
  <div class="ink-dialog-actions">
    <DialogClose as-child>
      <button type="button" class="ink-button" data-ink-signature-cancel>
        {{ SIGNATURE_LABELS.cancel }}
      </button>
    </DialogClose>
    <button
      type="button"
      class="ink-button"
      data-variant="primary"
      data-ink-signature-save
      :disabled="!s.canSave"
      @click="save"
    >
      {{ SIGNATURE_LABELS.save }}
    </button>
  </div>
</template>
