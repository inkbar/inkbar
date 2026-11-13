var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6"> setup lang=</span><span style="color:#E4FF4A">"ts"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * A table of contents, an index and an outline in one document. The outline lists the</span></span>
<span class="line"><span style="color:#A9AFCB"> * chapters on the left; click an entry to jump to it, and press the right arrow on</span></span>
<span class="line"><span style="color:#A9AFCB"> * "3. Recording and checking" to open it. Click a line of the contents on page 2, or a page</span></span>
<span class="line"><span style="color:#A9AFCB"> * number in the index on the last page, then use Back to return. The web link in section 3.3</span></span>
<span class="line"><span style="color:#A9AFCB"> * is not opened by Inkbar: it comes to the \`action\` event, and this code opens the tab.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { List, Search, Square } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/icons'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  InkBack,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkDownloadButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkForward,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkOutline,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPanel,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPrintButton,</span></span>
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
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { storage } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/signatures'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { InkDocument, ViewerAction } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { SidebarOpen } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> { source, messages, locale, log, onDocument, openFile } </span><span style="color:#9DABFF">=</span></span>
<span class="line"><span style="color:#FFFFFF">  defineProps</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">ScenarioProps</span><span style="color:#C9CEE6">>()</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">// The panel the left sidebar starts on.</span></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> openPanel </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> ref</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">SidebarOpen</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> undefined>(</span><span style="color:#E4FF4A">'outline'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> onReady</span><span style="color:#C9CEE6">(doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#FFFFFF">  log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'@ready'</span><span style="color:#C9CEE6">, { pages: doc.pages.length })</span></span>
<span class="line"><span style="color:#FFFFFF">  onDocument</span><span style="color:#C9CEE6">(doc)</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> onAction</span><span style="color:#C9CEE6">(action</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ViewerAction</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#FFFFFF">  log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'@action'</span><span style="color:#C9CEE6">, action)</span></span>
<span class="line"><span style="color:#9DABFF">  if</span><span style="color:#C9CEE6"> (action.kind </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'open-url'</span><span style="color:#C9CEE6">) window.</span><span style="color:#FFFFFF">open</span><span style="color:#C9CEE6">(action.url, </span><span style="color:#E4FF4A">'_blank'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'noopener'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">template</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">InkRoot</span></span>
<span class="line"><span style="color:#C9CEE6">    :src=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">source</span><span style="color:#C9CEE6">"</span></span>
<span class="line"><span style="color:#C9CEE6">    :messages=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">messages</span><span style="color:#C9CEE6">"</span></span>
<span class="line"><span style="color:#C9CEE6">    :locale=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">locale</span><span style="color:#C9CEE6">"</span></span>
<span class="line"><span style="color:#C9CEE6">    :assets=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">assets</span><span style="color:#C9CEE6">"</span></span>
<span class="line"><span style="color:#C9CEE6">    :storage=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">storage</span><span style="color:#C9CEE6">"</span></span>
<span class="line"><span style="color:#C9CEE6">    class=</span><span style="color:#E4FF4A">"scenario-root"</span></span>
<span class="line"><span style="color:#C9CEE6">    @ready=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">onReady</span><span style="color:#C9CEE6">"</span></span>
<span class="line"><span style="color:#C9CEE6">    @action=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">onAction</span><span style="color:#C9CEE6">"</span></span>
<span class="line"><span style="color:#C9CEE6">  ></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-toolbar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Tools"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"select-text"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"select"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"History"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkBack</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkForward</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group scenario-file"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"File"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Open a PDF"</span><span style="color:#C9CEE6"> title=</span><span style="color:#E4FF4A">"Open a PDF"</span><span style="color:#C9CEE6"> @click=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">openFile</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkIcon</span><span style="color:#C9CEE6"> :icon=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">FileUp</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          Open</span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkDownloadButton</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkPrintButton</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-body"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6"> v-model:open=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">openPanel</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6"> name=</span><span style="color:#E4FF4A">"outline"</span><span style="color:#C9CEE6"> side=</span><span style="color:#E4FF4A">"left"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"outline"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Outline"</span><span style="color:#C9CEE6"> :icon=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">List</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkOutline</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"pages"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Pages"</span><span style="color:#C9CEE6"> :icon=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">Square</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkThumbnails</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"search"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Search"</span><span style="color:#C9CEE6"> :icon=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">Search</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkSearchResults</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkViewport</span><span style="color:#C9CEE6"> /></span></span>
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
 * A table of contents, an index and an outline in one document. The outline lists the
 * chapters on the left; click an entry to jump to it, and press the right arrow on
 * "3. Recording and checking" to open it. Click a line of the contents on page 2, or a page
 * number in the index on the last page, then use Back to return. The web link in section 3.3
 * is not opened by Inkbar: it comes to the \`action\` event, and this code opens the tab.
 */
import { List, Search, Square } from '@inkbar/icons'
import {
  InkBack,
  InkDownloadButton,
  InkForward,
  InkIcon,
  InkNextPage,
  InkOutline,
  InkPageCount,
  InkPageInput,
  InkPanel,
  InkPrevPage,
  InkPrintButton,
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
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument, ViewerAction } from '@inkbar/core'
import type { SidebarOpen } from '@inkbar/core/dom'

const { source, messages, locale, log, onDocument, openFile } =
  defineProps<ScenarioProps>()

// The panel the left sidebar starts on.
const openPanel = ref<SidebarOpen | undefined>('outline')

function onReady(doc: InkDocument): void {
  log('@ready', { pages: doc.pages.length })
  onDocument(doc)
}

function onAction(action: ViewerAction): void {
  log('@action', action)
  if (action.kind === 'open-url') window.open(action.url, '_blank', 'noopener')
}
<\/script>

<template>
  <InkRoot
    :src="source"
    :messages="messages"
    :locale="locale"
    :assets="assets"
    :storage="storage"
    class="scenario-root"
    @ready="onReady"
    @action="onAction"
  >
    <InkToolbar class="scenario-toolbar">
      <div class="scenario-group" role="group" aria-label="Tools">
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
      </div>
      <div class="scenario-group" role="group" aria-label="History">
        <InkBack />
        <InkForward />
      </div>
      <div class="scenario-group scenario-file" role="group" aria-label="File">
        <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" @click="openFile">
          <InkIcon :icon="FileUp" />
          Open
        </InkToolbarButton>
        <InkDownloadButton />
        <InkPrintButton />
      </div>
    </InkToolbar>
    <div class="scenario-body">
      <InkSidebar v-model:open="openPanel" name="outline" side="left">
        <InkPanel id="outline" label="Outline" :icon="List">
          <InkOutline />
        </InkPanel>
        <InkPanel id="pages" label="Pages" :icon="Square">
          <InkThumbnails />
        </InkPanel>
        <InkPanel id="search" label="Search" :icon="Search">
          <InkSearchResults />
        </InkPanel>
      </InkSidebar>
      <InkViewport />
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