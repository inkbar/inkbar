<script setup lang="ts">
/*
 * The document keeps its own annotations and undo history. The page owns the form's values
 * (v-model:fields, written out so each change also refreshes the Gloss view) and hears the
 * form's requests (@form-action), which the Form panel lists.
 * The toolbars are built from Inkbar's components, so each control is yours to keep, move or
 * drop. Pass a button your own icon to replace the one it shows. Suggest redactions is a
 * plugin (src/plugin/suggestions.ts): registered in `plugins`, with its button placed by
 * InkCommand.
 */
import {
  InkColorMenu,
  InkCommand,
  InkFindBar,
  InkHighlightMenu,
  InkLineStyleMenu,
  InkTextStyleMenu,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkSearchButton,
  InkShapeMenu,
  InkSignatureMenu,
  InkThreadPopover,
  InkToolbar,
  InkToolbarSeparator,
  InkToolButton,
  InkUndo,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/vue'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'
import { ref, shallowRef } from 'vue'

import { suggestionsPlugin } from '../plugin/suggestions'
import '../plugin/suggestions.css'
import { glossFields, logAction, type LoggedAction } from '../shared/form'
import { signatureFonts, signatures } from '../shared/signatures'

import type { DocumentSource, FieldValues, FormAction, InkDocument } from '@inkbar/core'

defineProps<{ source: DocumentSource }>()

const doc = shallowRef<InkDocument | null>(null)
const fields = shallowRef<FieldValues>({})
const actions = ref<LoggedAction[]>([])
const gloss = ref('')

function onReady(d: InkDocument): void {
  doc.value = d
  gloss.value = glossFields(d)
}

function onFields(next: FieldValues): void {
  fields.value = next
  gloss.value = glossFields(doc.value)
}

function onFormAction(a: FormAction): void {
  actions.value = logAction(actions.value, a)
}
</script>

<template>
  <InkRoot
    :src="source"
    :assets="assets"
    :signatures="signatures"
    :signature-fonts="signatureFonts"
    :plugins="[suggestionsPlugin()]"
    :fields="fields"
    class="demo-root"
    @update:fields="onFields"
    @form-action="onFormAction"
    @ready="onReady"
  >
    <InkToolbar class="demo-toolbar">
      <InkHighlightMenu />
      <div class="demo-group" role="group" aria-label="Tools">
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
        <InkToolButton tool="redact-area" />
        <InkToolButton tool="sketch" />
        <InkToolButton tool="draw" />
        <InkShapeMenu />
        <InkToolButton tool="freetext" />
        <InkSignatureMenu />
        <InkToolButton tool="note" />
      </div>
      <InkToolbarSeparator />
      <div class="demo-group" role="group" aria-label="Style">
        <InkLineStyleMenu />
        <InkColorMenu property="border" />
        <InkColorMenu property="fill" />
        <InkTextStyleMenu />
      </div>
      <InkUndo />
      <InkRedo />
      <InkSearchButton />
      <div class="demo-actions" role="group" aria-label="Suggest">
        <InkCommand id="sandbox.suggest" />
      </div>
    </InkToolbar>
    <div class="demo-body">
      <InkViewport />
      <!-- It scrolls, so it takes focus for keyboard scrolling. -->
      <section class="demo-form" aria-labelledby="demo-form-title" tabindex="0">
        <h2 id="demo-form-title">Form</h2>
        <p>
          Inkbar never sends, opens or prints anything. The form's requests come here.
        </p>
        <h3>Actions</h3>
        <ol v-if="actions.length">
          <li v-for="a in actions" :key="a.id">{{ a.text }}</li>
        </ol>
        <p v-else>None yet. Try the buttons on page 6.</p>
        <h3>Fields as Gloss</h3>
        <pre>{{ gloss }}</pre>
      </section>
    </div>
    <InkToolbar label="Page and zoom" class="demo-status-bar">
      <div class="demo-group" role="group" aria-label="Page">
        <InkPrevPage />
        <InkPageInput />
        <InkPageCount />
        <InkNextPage />
      </div>
      <div class="demo-group demo-zoom" role="group" aria-label="Zoom">
        <InkZoomOut />
        <InkZoomSelect />
        <InkZoomIn />
      </div>
    </InkToolbar>
    <InkThreadPopover />
    <InkFindBar />
  </InkRoot>
</template>
