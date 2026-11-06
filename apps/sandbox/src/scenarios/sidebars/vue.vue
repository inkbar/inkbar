<script setup lang="ts">
/*
 * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails,
 * Search finds text, and Notes and Keys are your own markup. Layout switches both sidebars
 * between a rail, tabs and a stack; a closed panel keeps its content, so a note stays put.
 * Remove pages… opens a dialog of your own with one InkThumbnail per page inside its checkbox
 * label. It removes nothing: Remove only closes it.
 */
import { MessageSquareText, Search, Square, Type } from '@inkbar/icons'
import {
  InkIcon,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPanel,
  InkPrevPage,
  InkRoot,
  InkSearchResults,
  InkSidebar,
  InkThumbnail,
  InkThumbnails,
  InkToolbar,
  InkToolbarButton,
  InkToolButton,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/vue'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'
import { ref, useTemplateRef } from 'vue'

import { FileUp } from '../../shared/file-up'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'
import type { SidebarLayout } from '@inkbar/core/dom'

const { source, log, onDocument, openFile } = defineProps<ScenarioProps>()

const KEYS: Record<SidebarLayout, string> = {
  rail: 'Up and Down move between the buttons, Home and End go to the first and last, and Enter or Space opens a panel, or closes the open one.',
  tabs: 'Left and Right move between the tabs, Home and End go to the first and last, and Enter or Space opens one.',
  stack:
    'Each header is a Tab stop. Up and Down move between them, and Enter or Space expands or collapses a section.',
}

const layout = ref<SidebarLayout>('rail')
/** Every page of the open document, 0-based, for the dialog. */
const pages = ref<number[]>([])
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

function onReady(doc: InkDocument): void {
  log('@ready', { pages: doc.pages.length })
  pages.value = doc.pages.map((_, i) => i)
  onDocument(doc)
}
</script>

<template>
  <InkRoot :src="source" :assets="assets" class="scenario-root" @ready="onReady">
    <InkToolbar class="scenario-toolbar">
      <div class="scenario-group" role="group" aria-label="Tools">
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
      </div>
      <label class="scenario-layout">
        Layout
        <select v-model="layout" class="ink-select">
          <option value="rail">Rail</option>
          <option value="tabs">Tabs</option>
          <option value="stack">Stack</option>
        </select>
      </label>
      <div class="scenario-actions" role="group" aria-label="Pages">
        <InkToolbarButton @click="dialog?.showModal()">Remove pages…</InkToolbarButton>
      </div>
      <div class="scenario-group scenario-file" role="group" aria-label="File">
        <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" @click="openFile">
          <InkIcon :icon="FileUp" />
          Open
        </InkToolbarButton>
      </div>
    </InkToolbar>
    <div class="scenario-body">
      <InkSidebar side="left" :layout="layout">
        <InkPanel id="pages" label="Pages" :icon="Square">
          <InkThumbnails />
        </InkPanel>
        <InkPanel id="search" label="Search" :icon="Search">
          <InkSearchResults />
        </InkPanel>
      </InkSidebar>
      <InkViewport />
      <InkSidebar side="right" :layout="layout">
        <InkPanel id="notes" label="Notes" :icon="MessageSquareText">
          <div class="sidebar-notes">
            <textarea aria-label="Notes" placeholder="Anything to remember" />
          </div>
        </InkPanel>
        <InkPanel id="keys" label="Keys" :icon="Type">
          <p class="sidebar-keys">{{ KEYS[layout] }}</p>
        </InkPanel>
      </InkSidebar>
    </div>
    <InkToolbar label="Page and zoom" class="scenario-status-bar">
      <div class="scenario-group" role="group" aria-label="Page">
        <InkPrevPage />
        <InkPageInput />
        <InkPageCount />
        <InkNextPage />
      </div>
      <div class="scenario-group scenario-zoom" role="group" aria-label="Zoom">
        <InkZoomOut />
        <InkZoomSelect />
        <InkZoomIn />
      </div>
    </InkToolbar>
    <dialog ref="dialog" class="remove-pages" aria-labelledby="remove-pages-title">
      <form method="dialog">
        <h2 id="remove-pages-title">Remove pages</h2>
        <ul>
          <li v-for="page in pages" :key="page">
            <label>
              <input type="checkbox" :value="page" />
              <InkThumbnail :page="page" :width="96" />
              <span aria-hidden="true">{{ page + 1 }}</span>
            </label>
          </li>
        </ul>
        <div class="remove-pages-actions">
          <button value="cancel">Cancel</button>
          <button value="remove">Remove</button>
        </div>
      </form>
    </dialog>
  </InkRoot>
</template>
