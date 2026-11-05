var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6"> setup lang=</span><span style="color:#E4FF4A">"ts"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Two hundred pages, and no creation tools. The viewer renders only the pages near the</span></span>
<span class="line"><span style="color:#A9AFCB"> * viewport, but search reads every page's text, so the find bar counts every hit and steps to</span></span>
<span class="line"><span style="color:#A9AFCB"> * any of them. Find opens the bar, as does Ctrl+F or Cmd+F. The Results panel lists every hit</span></span>
<span class="line"><span style="color:#A9AFCB"> * and follows the bar. useSearch gives the same state the bar shows, for a control of your own.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { Search } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/icons'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  InkFindBar,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPanel,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkRoot,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkSearchButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkSearchResults,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkSidebar,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbarButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkViewport,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomSelect,</span></span>
<span class="line"><span style="color:#C9CEE6">  useSearch,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/vue'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { defineComponent, watch } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'vue'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { FileUp } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/file-up'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { InkDocument } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> { source, log, onDocument, openFile } </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> defineProps</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">ScenarioProps</span><span style="color:#C9CEE6">>()</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/**</span></span>
<span class="line"><span style="color:#A9AFCB"> * Logs each finished search and each step to a hit, while the find bar is open. It sits inside</span></span>
<span class="line"><span style="color:#A9AFCB"> * InkRoot to reach search.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> SearchLog </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> defineComponent</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> { state } </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useSearch</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#FFFFFF">  watch</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">    [</span></span>
<span class="line"><span style="color:#C9CEE6">      () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> state.value.open,</span></span>
<span class="line"><span style="color:#C9CEE6">      () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> state.value.query,</span></span>
<span class="line"><span style="color:#C9CEE6">      () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> state.value.hits.length,</span></span>
<span class="line"><span style="color:#C9CEE6">      () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> state.value.current,</span></span>
<span class="line"><span style="color:#C9CEE6">      () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> state.value.scanning,</span></span>
<span class="line"><span style="color:#C9CEE6">    ],</span></span>
<span class="line"><span style="color:#C9CEE6">    ([open, query, hits, current, scanning]) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">      if</span><span style="color:#C9CEE6"> (open </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> query </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">scanning) </span><span style="color:#FFFFFF">log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'search'</span><span style="color:#C9CEE6">, { query, hits, current })</span></span>
<span class="line"><span style="color:#C9CEE6">    }</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#E4FF4A"> null</span></span>
<span class="line"><span style="color:#C9CEE6">})</span></span>
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
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkSearchButton</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group scenario-file"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"File"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Open a PDF"</span><span style="color:#C9CEE6"> title=</span><span style="color:#E4FF4A">"Open a PDF"</span><span style="color:#C9CEE6"> @click=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">openFile</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkIcon</span><span style="color:#C9CEE6"> :icon=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">FileUp</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          Open</span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-body"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkViewport</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6"> side=</span><span style="color:#E4FF4A">"right"</span><span style="color:#C9CEE6"> layout=</span><span style="color:#E4FF4A">"tabs"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"results"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Results"</span><span style="color:#C9CEE6"> :icon=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">Search</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkSearchResults</span><span style="color:#C9CEE6"> :field=</span><span style="color:#C9CEE6">"</span><span style="color:#E4FF4A">false</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkFindBar</span><span style="color:#C9CEE6"> /></span></span>
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
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">SearchLog</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;/</span><span style="color:#FFFFFF">InkRoot</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">template</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span></code></pre>`,code:`<script setup lang="ts">
/*
 * Two hundred pages, and no creation tools. The viewer renders only the pages near the
 * viewport, but search reads every page's text, so the find bar counts every hit and steps to
 * any of them. Find opens the bar, as does Ctrl+F or Cmd+F. The Results panel lists every hit
 * and follows the bar. useSearch gives the same state the bar shows, for a control of your own.
 */
import { Search } from '@inkbar/icons'
import {
  InkFindBar,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPanel,
  InkPrevPage,
  InkRoot,
  InkSearchButton,
  InkSearchResults,
  InkSidebar,
  InkIcon,
  InkToolbar,
  InkToolbarButton,
  InkToolButton,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
  useSearch,
} from '@inkbar/vue'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'
import { defineComponent, watch } from 'vue'

import { FileUp } from '../../shared/file-up'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

const { source, log, onDocument, openFile } = defineProps<ScenarioProps>()

/**
 * Logs each finished search and each step to a hit, while the find bar is open. It sits inside
 * InkRoot to reach search.
 */
const SearchLog = defineComponent(() => {
  const { state } = useSearch()
  watch(
    [
      () => state.value.open,
      () => state.value.query,
      () => state.value.hits.length,
      () => state.value.current,
      () => state.value.scanning,
    ],
    ([open, query, hits, current, scanning]) => {
      if (open && query && !scanning) log('search', { query, hits, current })
    }
  )
  return () => null
})

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
      <InkSearchButton />
      <div class="scenario-group scenario-file" role="group" aria-label="File">
        <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" @click="openFile">
          <InkIcon :icon="FileUp" />
          Open
        </InkToolbarButton>
      </div>
    </InkToolbar>
    <div class="scenario-body">
      <InkViewport />
      <InkSidebar side="right" layout="tabs">
        <InkPanel id="results" label="Results" :icon="Search">
          <InkSearchResults :field="false" />
        </InkPanel>
      </InkSidebar>
    </div>
    <InkFindBar />
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
    <SearchLog />
  </InkRoot>
</template>
`};export{e as default};