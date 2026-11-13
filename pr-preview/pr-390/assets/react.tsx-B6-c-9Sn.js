var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Two hundred pages, and no creation tools. The viewer renders only the pages near the</span></span>
<span class="line"><span style="color:#A9AFCB"> * viewport, but search reads every page's text, so the find bar counts every hit and steps to</span></span>
<span class="line"><span style="color:#A9AFCB"> * any of them. Find opens the bar, as does Ctrl+F or Cmd+F. The results sidebar lists every</span></span>
<span class="line"><span style="color:#A9AFCB"> * hit and shows only while there are hits. useSearch gives the same state the bar shows, for a</span></span>
<span class="line"><span style="color:#A9AFCB"> * control of your own.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  InkDownloadButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPrintButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkFindBar,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkRoot,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkSearchButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkSearchResults,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbarButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkViewport,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomSelect,</span></span>
<span class="line"><span style="color:#C9CEE6">  useSearch,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/react'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { useEffect } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'react'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { FileUp } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/file-up'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { storage } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/signatures'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { Log, ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { InkDocument } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/**</span></span>
<span class="line"><span style="color:#A9AFCB"> * Every hit, in a panel right of the pages; the find bar is the query field. Your code decides</span></span>
<span class="line"><span style="color:#A9AFCB"> * when it shows: here, while the search has hits. It sits inside InkRoot to reach search.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> ResultsSidebar</span><span style="color:#C9CEE6">() {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> hasResults </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useSearch</span><span style="color:#C9CEE6">().state.hits.length </span><span style="color:#9DABFF">></span><span style="color:#E4FF4A"> 0</span></span>
<span class="line"><span style="color:#A9AFCB">  // Hidden rather than removed, so the list keeps its scroll between searches.</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> (</span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">aside</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"results-aside"</span><span style="color:#C9CEE6"> aria-labelledby</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"results-title"</span><span style="color:#C9CEE6"> hidden</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{</span><span style="color:#9DABFF">!</span><span style="color:#C9CEE6">hasResults}></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">h2</span><span style="color:#C9CEE6"> id</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"results-title"</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"results-aside-title"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        Search results</span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">h2</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkSearchResults</span><span style="color:#C9CEE6"> field</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{</span><span style="color:#E4FF4A">false</span><span style="color:#C9CEE6">} /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">aside</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/**</span></span>
<span class="line"><span style="color:#A9AFCB"> * Logs each finished search and each step to a hit, while the find bar is open. It sits inside</span></span>
<span class="line"><span style="color:#A9AFCB"> * InkRoot to reach search.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> SearchLog</span><span style="color:#C9CEE6">({ log }</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> { log</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Log</span><span style="color:#C9CEE6"> }) {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> { open, query, hits, current, scanning } </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useSearch</span><span style="color:#C9CEE6">().state</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> count </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> hits.length</span></span>
<span class="line"><span style="color:#FFFFFF">  useEffect</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (open </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> query </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">scanning) </span><span style="color:#FFFFFF">log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'search'</span><span style="color:#C9CEE6">, { query, hits: count, current })</span></span>
<span class="line"><span style="color:#C9CEE6">  }, [open, query, count, current, scanning, log])</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#E4FF4A"> null</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> default</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> SearchLongDocument</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">  source,</span></span>
<span class="line"><span style="color:#C9CEE6">  messages,</span></span>
<span class="line"><span style="color:#C9CEE6">  locale,</span></span>
<span class="line"><span style="color:#C9CEE6">  log,</span></span>
<span class="line"><span style="color:#C9CEE6">  onDocument,</span></span>
<span class="line"><span style="color:#C9CEE6">  openFile,</span></span>
<span class="line"><span style="color:#C9CEE6">}</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioProps</span><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> onReady</span><span style="color:#C9CEE6">(doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#FFFFFF">    log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onReady'</span><span style="color:#C9CEE6">, { pages: doc.pages.length })</span></span>
<span class="line"><span style="color:#FFFFFF">    onDocument</span><span style="color:#C9CEE6">(doc)</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> (</span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkRoot</span></span>
<span class="line"><span style="color:#C9CEE6">      src</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{source}</span></span>
<span class="line"><span style="color:#C9CEE6">      messages</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{messages}</span></span>
<span class="line"><span style="color:#C9CEE6">      locale</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{locale}</span></span>
<span class="line"><span style="color:#C9CEE6">      assets</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{assets}</span></span>
<span class="line"><span style="color:#C9CEE6">      storage</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{storage}</span></span>
<span class="line"><span style="color:#C9CEE6">      onReady</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{onReady}</span></span>
<span class="line"><span style="color:#C9CEE6">      className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-root"</span></span>
<span class="line"><span style="color:#C9CEE6">    ></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-toolbar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Tools"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"select-text"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"select"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkSearchButton</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group scenario-file"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"File"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Open a PDF"</span><span style="color:#C9CEE6"> title</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Open a PDF"</span><span style="color:#C9CEE6"> onClick</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{openFile}></span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">InkIcon</span><span style="color:#C9CEE6"> icon</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{FileUp} /></span></span>
<span class="line"><span style="color:#C9CEE6">            Open</span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;/</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkDownloadButton</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkPrintButton</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-body"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkViewport</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">ResultsSidebar</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkFindBar</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Page and zoom"</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-status-bar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Page"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkPrevPage</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkPageInput</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkPageCount</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkNextPage</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group scenario-zoom"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Zoom"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkZoomOut</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkZoomSelect</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkZoomIn</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">SearchLog</span><span style="color:#C9CEE6"> log</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{log} /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkRoot</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Two hundred pages, and no creation tools. The viewer renders only the pages near the
 * viewport, but search reads every page's text, so the find bar counts every hit and steps to
 * any of them. Find opens the bar, as does Ctrl+F or Cmd+F. The results sidebar lists every
 * hit and shows only while there are hits. useSearch gives the same state the bar shows, for a
 * control of your own.
 */
import {
  InkDownloadButton,
  InkPrintButton,
  InkFindBar,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRoot,
  InkSearchButton,
  InkSearchResults,
  InkIcon,
  InkToolbar,
  InkToolbarButton,
  InkToolButton,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
  useSearch,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { useEffect } from 'react'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { Log, ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

/**
 * Every hit, in a panel right of the pages; the find bar is the query field. Your code decides
 * when it shows: here, while the search has hits. It sits inside InkRoot to reach search.
 */
function ResultsSidebar() {
  const hasResults = useSearch().state.hits.length > 0
  // Hidden rather than removed, so the list keeps its scroll between searches.
  return (
    <aside className="results-aside" aria-labelledby="results-title" hidden={!hasResults}>
      <h2 id="results-title" className="results-aside-title">
        Search results
      </h2>
      <InkSearchResults field={false} />
    </aside>
  )
}

/**
 * Logs each finished search and each step to a hit, while the find bar is open. It sits inside
 * InkRoot to reach search.
 */
function SearchLog({ log }: { log: Log }) {
  const { open, query, hits, current, scanning } = useSearch().state
  const count = hits.length
  useEffect(() => {
    if (open && query && !scanning) log('search', { query, hits: count, current })
  }, [open, query, count, current, scanning, log])
  return null
}

export default function SearchLongDocument({
  source,
  messages,
  locale,
  log,
  onDocument,
  openFile,
}: ScenarioProps) {
  function onReady(doc: InkDocument) {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }

  return (
    <InkRoot
      src={source}
      messages={messages}
      locale={locale}
      assets={assets}
      storage={storage}
      onReady={onReady}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <div className="scenario-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
        </div>
        <InkSearchButton />
        <div className="scenario-group scenario-file" role="group" aria-label="File">
          <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" onClick={openFile}>
            <InkIcon icon={FileUp} />
            Open
          </InkToolbarButton>
          <InkDownloadButton />
          <InkPrintButton />
        </div>
      </InkToolbar>
      <div className="scenario-body">
        <InkViewport />
        <ResultsSidebar />
      </div>
      <InkFindBar />
      <InkToolbar label="Page and zoom" className="scenario-status-bar">
        <div className="scenario-group" role="group" aria-label="Page">
          <InkPrevPage />
          <InkPageInput />
          <InkPageCount />
          <InkNextPage />
        </div>
        <div className="scenario-group scenario-zoom" role="group" aria-label="Zoom">
          <InkZoomOut />
          <InkZoomSelect />
          <InkZoomIn />
        </div>
      </InkToolbar>
      <SearchLog log={log} />
    </InkRoot>
  )
}
`};export{e as default};