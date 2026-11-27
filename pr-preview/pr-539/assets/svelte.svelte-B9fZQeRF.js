import"./client-DlM7410A.js";var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6"> lang=</span><span style="color:#E4FF4A">"ts"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#A9AFCB">  /*</span></span>
<span class="line"><span style="color:#A9AFCB">   * Suggest redactions is a plugin (src/plugin/suggestions.ts). Register it in \`plugins\` and</span></span>
<span class="line"><span style="color:#A9AFCB">   * place its command where you want with InkCommand. Suggest adds the plugin's own records,</span></span>
<span class="line"><span style="color:#A9AFCB">   * draws a mark on each and opens a card when you press one. Accept turns a suggestion into a</span></span>
<span class="line"><span style="color:#A9AFCB">   * redaction. CommandLog, beside this file, logs each result of the command. Thumbnails of</span></span>
<span class="line"><span style="color:#A9AFCB">   * the pages sit in the left sidebar; ReviewSidebar, beside this file, is the right.</span></span>
<span class="line"><span style="color:#A9AFCB">   */</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { allTools, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> SidebarOpen } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { Square } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/icons'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    InkApplyRedactions,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkDownloadButton,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkPrintButton,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkColorMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkCommand,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkHighlightMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkLineStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkPanel,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkRedo,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkRoot,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkShapeMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkSidebar,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkSignatureMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkTextStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkThreadPopover,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkThumbnails,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkToolbarButton,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkToolbarSeparator,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkUndo,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkViewport,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkZoomSelect,</span></span>
<span class="line"><span style="color:#C9CEE6">  } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/svelte'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { suggestionsPlugin } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../plugin/suggestions'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#E4FF4A"> '../../plugin/suggestions.css'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { FileUp } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/file-up'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { signatureFonts, storage } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/signatures'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> CommandLog </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> './CommandLog.svelte'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> ReviewSidebar </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> './ReviewSidebar.svelte'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { InkDocument } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> { source, messages, locale, labels, log, onDocument, openFile }</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioProps</span><span style="color:#9DABFF"> =</span></span>
<span class="line"><span style="color:#C9CEE6">    $</span><span style="color:#FFFFFF">props</span><span style="color:#C9CEE6">()</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> tools </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> allTools</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#A9AFCB">  // The plugin reads its words when it shows them, so they follow the language.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> plugins </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> [</span><span style="color:#FFFFFF">suggestionsPlugin</span><span style="color:#C9CEE6">({ </span><span style="color:#FFFFFF">text</span><span style="color:#C9CEE6">: () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> labels.plugin })]</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  /** The Pages panel starts closed, leaving the pages the room. */</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> pagesOpen </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">state</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">SidebarOpen</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">null</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> onReady</span><span style="color:#C9CEE6">(doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#FFFFFF">    log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onReady'</span><span style="color:#C9CEE6">, { pages: doc.pages.length })</span></span>
<span class="line"><span style="color:#FFFFFF">    onDocument</span><span style="color:#C9CEE6">(doc)</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">InkRoot</span></span>
<span class="line"><span style="color:#C9CEE6">  src={source}</span></span>
<span class="line"><span style="color:#C9CEE6">  {messages}</span></span>
<span class="line"><span style="color:#C9CEE6">  {locale}</span></span>
<span class="line"><span style="color:#C9CEE6">  {assets}</span></span>
<span class="line"><span style="color:#C9CEE6">  {tools}</span></span>
<span class="line"><span style="color:#C9CEE6">  {plugins}</span></span>
<span class="line"><span style="color:#C9CEE6">  {storage}</span></span>
<span class="line"><span style="color:#C9CEE6">  {signatureFonts}</span></span>
<span class="line"><span style="color:#C9CEE6">  {onReady}</span></span>
<span class="line"><span style="color:#C9CEE6">  onActivate={(id) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onActivate'</span><span style="color:#C9CEE6">, id)}</span></span>
<span class="line"><span style="color:#C9CEE6">  class=</span><span style="color:#E4FF4A">"scenario-root"</span></span>
<span class="line"><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-toolbar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label={labels.tools}></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkHighlightMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"select-text"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"select"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"redact-area"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkApplyRedactions</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"sketch"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"draw"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkShapeMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"freetext"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkSignatureMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool=</span><span style="color:#E4FF4A">"note"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkToolbarSeparator</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label={labels.style}></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkLineStyleMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkColorMenu</span><span style="color:#C9CEE6"> property=</span><span style="color:#E4FF4A">"border"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkColorMenu</span><span style="color:#C9CEE6"> property=</span><span style="color:#E4FF4A">"fill"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkTextStyleMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label={labels.history}></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkUndo</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkRedo</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-actions"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label={labels.suggest}></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkCommand</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"sandbox.suggest"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group scenario-file"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label={labels.file}></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolbarButton</span></span>
<span class="line"><span style="color:#C9CEE6">        aria-label={labels.openPdf}</span></span>
<span class="line"><span style="color:#C9CEE6">        title={labels.openPdf}</span></span>
<span class="line"><span style="color:#C9CEE6">        onclick={openFile}</span></span>
<span class="line"><span style="color:#C9CEE6">      ></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkIcon</span><span style="color:#C9CEE6"> icon={FileUp} /></span></span>
<span class="line"><span style="color:#C9CEE6">        {labels.open}</span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkDownloadButton</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPrintButton</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-body"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6"> name=</span><span style="color:#E4FF4A">"redactions-left"</span><span style="color:#C9CEE6"> side=</span><span style="color:#E4FF4A">"left"</span><span style="color:#C9CEE6"> layout=</span><span style="color:#E4FF4A">"rail"</span><span style="color:#9DABFF"> bind</span><span style="color:#C9CEE6">:</span><span style="color:#FFFFFF">open</span><span style="color:#C9CEE6">={pagesOpen}></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"pages"</span><span style="color:#C9CEE6"> label={labels.pages} icon={Square}></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkThumbnails</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkViewport</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">ReviewSidebar</span><span style="color:#C9CEE6"> {labels} /></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> label={labels.pageAndZoom} class=</span><span style="color:#E4FF4A">"scenario-status-bar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label={labels.page}></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPrevPage</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPageInput</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPageCount</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkNextPage</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"scenario-group scenario-zoom"</span><span style="color:#C9CEE6"> role=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label={labels.zoom}></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkZoomOut</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkZoomSelect</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkZoomIn</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">InkThreadPopover</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">CommandLog</span><span style="color:#C9CEE6"> {log} /></span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">InkRoot</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span></code></pre>`,code:`<script lang="ts">
  /*
   * Suggest redactions is a plugin (src/plugin/suggestions.ts). Register it in \`plugins\` and
   * place its command where you want with InkCommand. Suggest adds the plugin's own records,
   * draws a mark on each and opens a card when you press one. Accept turns a suggestion into a
   * redaction. CommandLog, beside this file, logs each result of the command. Thumbnails of
   * the pages sit in the left sidebar; ReviewSidebar, beside this file, is the right.
   */
  import { allTools, type SidebarOpen } from '@inkbar/core/dom'
  import { Square } from '@inkbar/icons'
  import {
    InkApplyRedactions,
    InkDownloadButton,
    InkPrintButton,
    InkColorMenu,
    InkCommand,
    InkHighlightMenu,
    InkLineStyleMenu,
    InkNextPage,
    InkPageCount,
    InkPanel,
    InkPageInput,
    InkPrevPage,
    InkRedo,
    InkRoot,
    InkShapeMenu,
    InkSidebar,
    InkSignatureMenu,
    InkTextStyleMenu,
    InkThreadPopover,
    InkThumbnails,
    InkIcon,
    InkToolbar,
    InkToolbarButton,
    InkToolbarSeparator,
    InkToolButton,
    InkUndo,
    InkViewport,
    InkZoomIn,
    InkZoomOut,
    InkZoomSelect,
  } from '@inkbar/svelte'
  import '@inkbar/theme/theme.css'
  import { assets } from 'virtual:inkbar-assets'

  import { suggestionsPlugin } from '../../plugin/suggestions'
  import '../../plugin/suggestions.css'
  import { FileUp } from '../../shared/file-up'
  import { signatureFonts, storage } from '../../shared/signatures'

  import CommandLog from './CommandLog.svelte'
  import ReviewSidebar from './ReviewSidebar.svelte'

  import type { ScenarioProps } from '../../frameworks/types'
  import type { InkDocument } from '@inkbar/core'

  let { source, messages, locale, labels, log, onDocument, openFile }: ScenarioProps =
    $props()

  const tools = allTools()
  // The plugin reads its words when it shows them, so they follow the language.
  const plugins = [suggestionsPlugin({ text: () => labels.plugin })]

  /** The Pages panel starts closed, leaving the pages the room. */
  let pagesOpen = $state<SidebarOpen>(null)

  function onReady(doc: InkDocument): void {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }
<\/script>

<InkRoot
  src={source}
  {messages}
  {locale}
  {assets}
  {tools}
  {plugins}
  {storage}
  {signatureFonts}
  {onReady}
  onActivate={(id) => log('onActivate', id)}
  class="scenario-root"
>
  <InkToolbar class="scenario-toolbar">
    <div class="scenario-group" role="group" aria-label={labels.tools}>
      <InkHighlightMenu />
      <InkToolButton tool="select-text" />
      <InkToolButton tool="select" />
      <InkToolButton tool="redact-area" />
      <InkApplyRedactions />
      <InkToolButton tool="sketch" />
      <InkToolButton tool="draw" />
      <InkShapeMenu />
      <InkToolButton tool="freetext" />
      <InkSignatureMenu />
      <InkToolButton tool="note" />
    </div>
    <InkToolbarSeparator />
    <div class="scenario-group" role="group" aria-label={labels.style}>
      <InkLineStyleMenu />
      <InkColorMenu property="border" />
      <InkColorMenu property="fill" />
      <InkTextStyleMenu />
    </div>
    <div class="scenario-group" role="group" aria-label={labels.history}>
      <InkUndo />
      <InkRedo />
    </div>
    <div class="scenario-actions" role="group" aria-label={labels.suggest}>
      <InkCommand id="sandbox.suggest" />
    </div>
    <div class="scenario-group scenario-file" role="group" aria-label={labels.file}>
      <InkToolbarButton
        aria-label={labels.openPdf}
        title={labels.openPdf}
        onclick={openFile}
      >
        <InkIcon icon={FileUp} />
        {labels.open}
      </InkToolbarButton>
      <InkDownloadButton />
      <InkPrintButton />
    </div>
  </InkToolbar>
  <div class="scenario-body">
    <InkSidebar name="redactions-left" side="left" layout="rail" bind:open={pagesOpen}>
      <InkPanel id="pages" label={labels.pages} icon={Square}>
        <InkThumbnails />
      </InkPanel>
    </InkSidebar>
    <InkViewport />
    <ReviewSidebar {labels} />
  </div>
  <InkToolbar label={labels.pageAndZoom} class="scenario-status-bar">
    <div class="scenario-group" role="group" aria-label={labels.page}>
      <InkPrevPage />
      <InkPageInput />
      <InkPageCount />
      <InkNextPage />
    </div>
    <div class="scenario-group scenario-zoom" role="group" aria-label={labels.zoom}>
      <InkZoomOut />
      <InkZoomSelect />
      <InkZoomIn />
    </div>
  </InkToolbar>
  <InkThreadPopover />
  <CommandLog {log} />
</InkRoot>
`};export{e as default};