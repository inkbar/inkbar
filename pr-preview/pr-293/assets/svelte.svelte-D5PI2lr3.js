import"./client-DlM7410A.js";var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6"> lang=</span><span style="color:#E4FF4A">"ts"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#A9AFCB">  /*</span></span>
<span class="line"><span style="color:#A9AFCB">   * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails,</span></span>
<span class="line"><span style="color:#A9AFCB">   * Search finds text, and Notes and Keys are your own markup. Layout switches both sidebars</span></span>
<span class="line"><span style="color:#A9AFCB">   * between a rail, tabs and a stack; a closed panel keeps its content, so a note stays put.</span></span>
<span class="line"><span style="color:#A9AFCB">   * Remove pages… opens a dialog of your own with one InkThumbnail per page inside its</span></span>
<span class="line"><span style="color:#A9AFCB">   * checkbox label. It removes nothing: Remove only closes it.</span></span>
<span class="line"><span style="color:#A9AFCB">   */</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { MessageSquareText, Search, Square, Type } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/icons'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    InkIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkPanel,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkRoot,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkSearchResults,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkSidebar,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkThumbnail,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkThumbnails,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkToolbarButton,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkViewport,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkZoomSelect,</span></span>
<span class="line"><span style="color:#C9CEE6">  } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/svelte'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { FileUp } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/file-up'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { InkDocument } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { SidebarLayout } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> { source, log, onDocument, openFile }</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioProps</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">props</span><span style="color:#C9CEE6">()</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> KEYS</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Record</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">SidebarLayout</span><span style="color:#C9CEE6">, string> </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    rail: </span><span style="color:#E4FF4A">'Up and Down move between the buttons, Home and End go to the first and last, and Enter or Space opens a panel, or closes the open one.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    tabs: </span><span style="color:#E4FF4A">'Left and Right move between the tabs, Home and End go to the first and last, and Enter or Space opens one.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    stack:</span></span>
<span class="line"><span style="color:#E4FF4A">      'Each header is a Tab stop. Up and Down move between them, and Enter or Space expands or collapses a section.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> layout </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">state</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">SidebarLayout</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">'rail'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#A9AFCB">  /** Every page of the open document, 0-based, for the dialog. */</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> pages </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">state</span><span style="color:#C9CEE6">&#x3C;number[]>([])</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> dialog </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">state</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">HTMLDialogElement</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> null>(</span><span style="color:#E4FF4A">null</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> onReady</span><span style="color:#C9CEE6">(doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#FFFFFF">    log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onReady'</span><span style="color:#C9CEE6">, { pages: doc.pages.length })</span></span>
<span class="line"><span style="color:#C9CEE6">    pages </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> doc.pages.</span><span style="color:#FFFFFF">map</span><span style="color:#C9CEE6">((_, i) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> i)</span></span>
<span class="line"><span style="color:#FFFFFF">    onDocument</span><span style="color:#C9CEE6">(doc)</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">InkRoot</span><span style="color:#C9CEE6"> src={source} {assets} {onReady} class=</span><span style="color:#E4FF4A">"scenario-root"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-toolbar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Tools"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"select-text"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"select"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">label</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-layout"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      Layout</span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">select</span><span style="color:#9DABFF"> bind</span><span style="color:#C9CEE6">:</span><span style="color:#FFFFFF">value</span><span style="color:#C9CEE6">={layout}></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">option</span><span style="color:#C9CEE6"> value=</span><span style="color:#E4FF4A">"rail"</span><span style="color:#C9CEE6">>Rail&#x3C;/</span><span style="color:#FFFFFF">option</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">option</span><span style="color:#C9CEE6"> value=</span><span style="color:#E4FF4A">"tabs"</span><span style="color:#C9CEE6">>Tabs&#x3C;/</span><span style="color:#FFFFFF">option</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">option</span><span style="color:#C9CEE6"> value=</span><span style="color:#E4FF4A">"stack"</span><span style="color:#C9CEE6">>Stack&#x3C;/</span><span style="color:#FFFFFF">option</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">select</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">label</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-actions"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Pages"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6"> onclick={() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> dialog?.</span><span style="color:#FFFFFF">showModal</span><span style="color:#C9CEE6">()}</span></span>
<span class="line"><span style="color:#C9CEE6">        >Remove pages…&#x3C;/</span><span style="color:#FFFFFF">InkToolbarButton</span></span>
<span class="line"><span style="color:#C9CEE6">      ></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group scenario-file"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"File"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Open a PDF"</span><span style="color:#C9CEE6"> title=</span><span style="color:#E4FF4A">"Open a PDF"</span><span style="color:#C9CEE6"> onclick={openFile}></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkIcon</span><span style="color:#C9CEE6"> icon={FileUp} /></span></span>
<span class="line"><span style="color:#C9CEE6">        Open</span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-body"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6"> side=</span><span style="color:#E4FF4A">"left"</span><span style="color:#C9CEE6"> {layout}></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"pages"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Pages"</span><span style="color:#C9CEE6"> icon={Square}></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkThumbnails</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"search"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Search"</span><span style="color:#C9CEE6"> icon={Search}></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkSearchResults</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkViewport</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6"> side=</span><span style="color:#E4FF4A">"right"</span><span style="color:#C9CEE6"> {layout}></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"notes"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Notes"</span><span style="color:#C9CEE6"> icon={MessageSquareText}></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"sidebar-notes"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">textarea</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Notes"</span><span style="color:#C9CEE6"> placeholder=</span><span style="color:#E4FF4A">"Anything to remember"</span><span style="color:#C9CEE6">>&#x3C;/</span><span style="color:#FFFFFF">textarea</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"keys"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Keys"</span><span style="color:#C9CEE6"> icon={Type}></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">p</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"sidebar-keys"</span><span style="color:#C9CEE6">>{KEYS[layout]}&#x3C;/</span><span style="color:#FFFFFF">p</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Page and zoom"</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-status-bar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Page"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPrevPage</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPageInput</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPageCount</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkNextPage</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group scenario-zoom"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label=</span><span style="color:#E4FF4A">"Zoom"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkZoomOut</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkZoomSelect</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkZoomIn</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">dialog</span><span style="color:#9DABFF"> bind</span><span style="color:#C9CEE6">:this={dialog} class=</span><span style="color:#E4FF4A">"remove-pages"</span><span style="color:#C9CEE6"> aria-labelledby=</span><span style="color:#E4FF4A">"remove-pages-title"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">form</span><span style="color:#C9CEE6"> method=</span><span style="color:#E4FF4A">"dialog"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">h2</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"remove-pages-title"</span><span style="color:#C9CEE6">>Remove pages&#x3C;/</span><span style="color:#FFFFFF">h2</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">ul</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        {#</span><span style="color:#9DABFF">each</span><span style="color:#C9CEE6"> pages </span><span style="color:#9DABFF">as</span><span style="color:#C9CEE6"> page (page)}</span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">li</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">label</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">              &#x3C;</span><span style="color:#FFFFFF">input</span><span style="color:#C9CEE6"> type=</span><span style="color:#E4FF4A">"checkbox"</span><span style="color:#C9CEE6"> value={page} /></span></span>
<span class="line"><span style="color:#C9CEE6">              &#x3C;</span><span style="color:#FFFFFF">InkThumbnail</span><span style="color:#C9CEE6"> {page} width={</span><span style="color:#E4FF4A">96</span><span style="color:#C9CEE6">} /></span></span>
<span class="line"><span style="color:#C9CEE6">              &#x3C;</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6"> aria-hidden=</span><span style="color:#E4FF4A">"true"</span><span style="color:#C9CEE6">>{page </span><span style="color:#9DABFF">+</span><span style="color:#E4FF4A"> 1</span><span style="color:#C9CEE6">}&#x3C;/</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;/</span><span style="color:#FFFFFF">label</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;/</span><span style="color:#FFFFFF">li</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        {/</span><span style="color:#9DABFF">each</span><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">ul</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"remove-pages-actions"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6"> value=</span><span style="color:#E4FF4A">"cancel"</span><span style="color:#C9CEE6">>Cancel&#x3C;/</span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6"> value=</span><span style="color:#E4FF4A">"remove"</span><span style="color:#C9CEE6">>Remove&#x3C;/</span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">form</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;/</span><span style="color:#FFFFFF">dialog</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">InkRoot</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span></code></pre>`,code:`<script lang="ts">
  /*
   * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails,
   * Search finds text, and Notes and Keys are your own markup. Layout switches both sidebars
   * between a rail, tabs and a stack; a closed panel keeps its content, so a note stays put.
   * Remove pages… opens a dialog of your own with one InkThumbnail per page inside its
   * checkbox label. It removes nothing: Remove only closes it.
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
  } from '@inkbar/svelte'
  import '@inkbar/theme/theme.css'
  import { assets } from 'virtual:inkbar-assets'

  import { FileUp } from '../../shared/file-up'

  import type { ScenarioProps } from '../../frameworks/types'
  import type { InkDocument } from '@inkbar/core'
  import type { SidebarLayout } from '@inkbar/core/dom'

  let { source, log, onDocument, openFile }: ScenarioProps = $props()

  const KEYS: Record<SidebarLayout, string> = {
    rail: 'Up and Down move between the buttons, Home and End go to the first and last, and Enter or Space opens a panel, or closes the open one.',
    tabs: 'Left and Right move between the tabs, Home and End go to the first and last, and Enter or Space opens one.',
    stack:
      'Each header is a Tab stop. Up and Down move between them, and Enter or Space expands or collapses a section.',
  }

  let layout = $state<SidebarLayout>('rail')
  /** Every page of the open document, 0-based, for the dialog. */
  let pages = $state<number[]>([])
  let dialog = $state<HTMLDialogElement | null>(null)

  function onReady(doc: InkDocument): void {
    log('onReady', { pages: doc.pages.length })
    pages = doc.pages.map((_, i) => i)
    onDocument(doc)
  }
<\/script>

<InkRoot src={source} {assets} {onReady} class="scenario-root">
  <InkToolbar class="scenario-toolbar">
    <div class="scenario-group" role="group" aria-label="Tools">
      <InkToolButton tool="select-text" />
      <InkToolButton tool="select" />
    </div>
    <label class="scenario-layout">
      Layout
      <select bind:value={layout}>
        <option value="rail">Rail</option>
        <option value="tabs">Tabs</option>
        <option value="stack">Stack</option>
      </select>
    </label>
    <div class="scenario-actions" role="group" aria-label="Pages">
      <InkToolbarButton onclick={() => dialog?.showModal()}
        >Remove pages…</InkToolbarButton
      >
    </div>
    <div class="scenario-group scenario-file" role="group" aria-label="File">
      <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" onclick={openFile}>
        <InkIcon icon={FileUp} />
        Open
      </InkToolbarButton>
    </div>
  </InkToolbar>
  <div class="scenario-body">
    <InkSidebar side="left" {layout}>
      <InkPanel id="pages" label="Pages" icon={Square}>
        <InkThumbnails />
      </InkPanel>
      <InkPanel id="search" label="Search" icon={Search}>
        <InkSearchResults />
      </InkPanel>
    </InkSidebar>
    <InkViewport />
    <InkSidebar side="right" {layout}>
      <InkPanel id="notes" label="Notes" icon={MessageSquareText}>
        <div class="sidebar-notes">
          <textarea aria-label="Notes" placeholder="Anything to remember"></textarea>
        </div>
      </InkPanel>
      <InkPanel id="keys" label="Keys" icon={Type}>
        <p class="sidebar-keys">{KEYS[layout]}</p>
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
  <dialog bind:this={dialog} class="remove-pages" aria-labelledby="remove-pages-title">
    <form method="dialog">
      <h2 id="remove-pages-title">Remove pages</h2>
      <ul>
        {#each pages as page (page)}
          <li>
            <label>
              <input type="checkbox" value={page} />
              <InkThumbnail {page} width={96} />
              <span aria-hidden="true">{page + 1}</span>
            </label>
          </li>
        {/each}
      </ul>
      <div class="remove-pages-actions">
        <button value="cancel">Cancel</button>
        <button value="remove">Remove</button>
      </div>
    </form>
  </dialog>
</InkRoot>
`};export{e as default};