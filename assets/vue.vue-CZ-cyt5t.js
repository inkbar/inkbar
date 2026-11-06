var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6"> setup lang=</span><span style="color:#E4FF4A">"ts"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails</span></span>
<span class="line"><span style="color:#A9AFCB"> * and Search finds text; About on the right is your own markup. Layout switches both</span></span>
<span class="line"><span style="color:#A9AFCB"> * sidebars between a rail, tabs and a stack.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { Info, Search, Square } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/icons'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  InkIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPanel,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkRoot,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkSearchResults,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkSidebar,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkThumbnails,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbarButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkViewport,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomSelect,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/vue'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { ref } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'vue'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { FileUp } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/file-up'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { InkDocument } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { SidebarLayout } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> { source, log, onDocument, openFile } </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> defineProps</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">ScenarioProps</span><span style="color:#C9CEE6">>()</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> layout </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> ref</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">SidebarLayout</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">'rail'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> onReady</span><span style="color:#C9CEE6">(doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#FFFFFF">  log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'@ready'</span><span style="color:#C9CEE6">, { pages: doc.pages.length })</span></span>
<span class="line"><span style="color:#FFFFFF">  onDocument</span><span style="color:#C9CEE6">(doc)</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">template</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">InkRoot</span><span style="color:#C9CEE6"> :src=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">source</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6"> :assets=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">assets</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-root"</span><span style="color:#C9CEE6"> @ready=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">onReady</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-toolbar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Tools"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"select-text"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"select"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">label</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-layout"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        Layout</span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">select</span><span style="color:#C9CEE6"> v-model=</span><span style="color:#E4FF4A">"layout"</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"ink-select"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">option</span><span style="color:#C9CEE6"> value=</span><span style="color:#E4FF4A">"rail"</span><span style="color:#C9CEE6">>Rail&#x3C;/</span><span style="color:#FFFFFF">option</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">option</span><span style="color:#C9CEE6"> value=</span><span style="color:#E4FF4A">"tabs"</span><span style="color:#C9CEE6">>Tabs&#x3C;/</span><span style="color:#FFFFFF">option</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">option</span><span style="color:#C9CEE6"> value=</span><span style="color:#E4FF4A">"stack"</span><span style="color:#C9CEE6">>Stack&#x3C;/</span><span style="color:#FFFFFF">option</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">select</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">label</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group scenario-file"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"File"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Open a PDF"</span><span style="color:#C9CEE6"> title=</span><span style="color:#E4FF4A">"Open a PDF"</span><span style="color:#C9CEE6"> @click=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">openFile</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkIcon</span><span style="color:#C9CEE6"> :icon=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">FileUp</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          Open</span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-body"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6"> side=</span><span style="color:#E4FF4A">"left"</span><span style="color:#C9CEE6"> :layout=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">layout</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"pages"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Pages"</span><span style="color:#C9CEE6"> :icon=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">Square</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkThumbnails</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"search"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Search"</span><span style="color:#C9CEE6"> :icon=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">Search</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkSearchResults</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkViewport</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6"> side=</span><span style="color:#E4FF4A">"right"</span><span style="color:#C9CEE6"> :layout=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">layout</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"about"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"About"</span><span style="color:#C9CEE6"> :icon=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">Info</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"sidebar-about"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">p</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">              Fill a sidebar with whatever you need: page thumbnails, search results or</span></span>
<span class="line"><span style="color:#C9CEE6">              components of your own.</span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;/</span><span style="color:#FFFFFF">p</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">p</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">              Panels can read and write plugin records, so a list here shows the same data</span></span>
<span class="line"><span style="color:#C9CEE6">              a plugin marks on the page.</span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;/</span><span style="color:#FFFFFF">p</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Page and zoom"</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-status-bar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Page"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkPrevPage</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkPageInput</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkPageCount</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkNextPage</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group scenario-zoom"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Zoom"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkZoomOut</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkZoomSelect</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkZoomIn</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;/</span><span style="color:#FFFFFF">InkRoot</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">template</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span></code></pre>`,code:`<script setup lang="ts">
/*
 * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails
 * and Search finds text; About on the right is your own markup. Layout switches both
 * sidebars between a rail, tabs and a stack.
 */
import { Info, Search, Square } from '@inkbar/icons'
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
import { ref } from 'vue'

import { FileUp } from '../../shared/file-up'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'
import type { SidebarLayout } from '@inkbar/core/dom'

const { source, log, onDocument, openFile } = defineProps<ScenarioProps>()

const layout = ref<SidebarLayout>('rail')

function onReady(doc: InkDocument): void {
  log('@ready', { pages: doc.pages.length })
  onDocument(doc)
}
<\/script>

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
        <InkPanel id="about" label="About" :icon="Info">
          <div class="sidebar-about">
            <p>
              Fill a sidebar with whatever you need: page thumbnails, search results or
              components of your own.
            </p>
            <p>
              Panels can read and write plugin records, so a list here shows the same data
              a plugin marks on the page.
            </p>
          </div>
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
  </InkRoot>
</template>
`};export{e as default};