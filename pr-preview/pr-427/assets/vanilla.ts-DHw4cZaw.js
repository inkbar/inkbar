var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Suggest redactions is a plugin (src/plugin/suggestions.ts). Register it in \`plugins\` and place</span></span>
<span class="line"><span style="color:#A9AFCB"> * its command where you want with createCommandButton. Suggest adds the plugin's own records,</span></span>
<span class="line"><span style="color:#A9AFCB"> * draws a mark on each and opens a card when you press one. Accept turns a suggestion into a</span></span>
<span class="line"><span style="color:#A9AFCB"> * redaction. Thumbnails of the pages sit in a sidebar on the left. On the right, the plugin's</span></span>
<span class="line"><span style="color:#A9AFCB"> * open suggestions as a list, and the ones accepted so far, written here on \`viewer.records\`.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  allTools,</span></span>
<span class="line"><span style="color:#C9CEE6">  createColorMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createCommandButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createHighlightMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createDownloadButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPrintButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createLineStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createRecordList,</span></span>
<span class="line"><span style="color:#C9CEE6">  createRedo,</span></span>
<span class="line"><span style="color:#C9CEE6">  createShapeMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createSidebar,</span></span>
<span class="line"><span style="color:#C9CEE6">  createSignatureMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createTextStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createThumbnails,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolbarSeparator,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createUndo,</span></span>
<span class="line"><span style="color:#C9CEE6">  createViewer,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomSelect,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> SidebarPanelInfo,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { Check, Square, SquareDashed } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/icons'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  acceptedFrom,</span></span>
<span class="line"><span style="color:#C9CEE6">  suggestionsPlugin,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> Suggestion,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../plugin/suggestions'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '../../plugin/suggestions.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { FileUp } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/file-up'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { signatureFonts, storage } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/signatures'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { DocumentSource, InkMessagesInput } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">  label</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string,</span></span>
<span class="line"><span style="color:#C9CEE6">  className</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string,</span></span>
<span class="line"><span style="color:#9DABFF">  ...</span><span style="color:#C9CEE6">controls</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">[]</span></span>
<span class="line"><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> g </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'div'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  g.className </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> className</span></span>
<span class="line"><span style="color:#C9CEE6">  g.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'role'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'group'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  g.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, label)</span></span>
<span class="line"><span style="color:#C9CEE6">  g.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">controls)</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> g</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> mount</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">  el</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  { source, messages, locale, log, onDocument, openFile }</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioProps</span></span>
<span class="line"><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> viewer </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createViewer</span><span style="color:#C9CEE6">(el, {</span></span>
<span class="line"><span style="color:#C9CEE6">    source,</span></span>
<span class="line"><span style="color:#9DABFF">    ...</span><span style="color:#C9CEE6">(messages </span><span style="color:#9DABFF">?</span><span style="color:#C9CEE6"> { messages } </span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> {}),</span></span>
<span class="line"><span style="color:#9DABFF">    ...</span><span style="color:#C9CEE6">(locale </span><span style="color:#9DABFF">?</span><span style="color:#C9CEE6"> { locale } </span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> {}),</span></span>
<span class="line"><span style="color:#C9CEE6">    assets,</span></span>
<span class="line"><span style="color:#C9CEE6">    tools: </span><span style="color:#FFFFFF">allTools</span><span style="color:#C9CEE6">(),</span></span>
<span class="line"><span style="color:#C9CEE6">    plugins: [</span><span style="color:#FFFFFF">suggestionsPlugin</span><span style="color:#C9CEE6">()],</span></span>
<span class="line"><span style="color:#C9CEE6">    storage,</span></span>
<span class="line"><span style="color:#C9CEE6">    signatureFonts,</span></span>
<span class="line"><span style="color:#FFFFFF">    onReady</span><span style="color:#C9CEE6">: (doc) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">      log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onReady'</span><span style="color:#C9CEE6">, { pages: doc.pages.length })</span></span>
<span class="line"><span style="color:#FFFFFF">      onDocument</span><span style="color:#C9CEE6">(doc)</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#FFFFFF">    onActivate</span><span style="color:#C9CEE6">: (id) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onActivate'</span><span style="color:#C9CEE6">, id),</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'scenario-root'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // Each result of the Suggest command arrives as its status.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> suggest </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.commands.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'sandbox.suggest'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> unfollowCommand </span><span style="color:#9DABFF">=</span></span>
<span class="line"><span style="color:#C9CEE6">    suggest?.status?.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">((status) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">      if</span><span style="color:#C9CEE6"> (status) </span><span style="color:#FFFFFF">log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'command'</span><span style="color:#C9CEE6">, status)</span></span>
<span class="line"><span style="color:#C9CEE6">    }) </span><span style="color:#9DABFF">??</span><span style="color:#C9CEE6"> (() </span><span style="color:#9DABFF">=></span><span style="color:#E4FF4A"> undefined</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> tools </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createToolbar</span><span style="color:#C9CEE6">({ messages: viewer.messages })</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'scenario-toolbar'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    createHighlightMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Tools'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'scenario-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'select-text'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'select'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'redact-area'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'sketch'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'draw'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createShapeMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'freetext'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createSignatureMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'note'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#FFFFFF">    createToolbarSeparator</span><span style="color:#C9CEE6">(),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Style'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'scenario-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createLineStyleMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createColorMenu</span><span style="color:#C9CEE6">(viewer, { property: </span><span style="color:#E4FF4A">'border'</span><span style="color:#C9CEE6"> }),</span></span>
<span class="line"><span style="color:#FFFFFF">      createColorMenu</span><span style="color:#C9CEE6">(viewer, { property: </span><span style="color:#E4FF4A">'fill'</span><span style="color:#C9CEE6"> }),</span></span>
<span class="line"><span style="color:#FFFFFF">      createTextStyleMenu</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#FFFFFF">    createUndo</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">    createRedo</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Suggest'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'scenario-actions'</span><span style="color:#C9CEE6">, </span><span style="color:#FFFFFF">createCommandButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'sandbox.suggest'</span><span style="color:#C9CEE6">))</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> status </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createToolbar</span><span style="color:#C9CEE6">({ label: </span><span style="color:#E4FF4A">'Page and zoom'</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#C9CEE6">  status.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'scenario-status-bar'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  status.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Page'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'scenario-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createPrevPage</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createPageInput</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createPageCount</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createNextPage</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Zoom'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'scenario-group scenario-zoom'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createZoomOut</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createZoomSelect</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createZoomIn</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    )</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // Your own button joins the toolbar like the built-in ones: arrow keys reach it.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> openButton </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'button'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  openButton.type </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'button'</span></span>
<span class="line"><span style="color:#C9CEE6">  openButton.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Open a PDF'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  openButton.title </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'Open a PDF'</span></span>
<span class="line"><span style="color:#C9CEE6">  openButton.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span><span style="color:#FFFFFF">createIcon</span><span style="color:#C9CEE6">(FileUp), </span><span style="color:#E4FF4A">'Open'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  openButton.</span><span style="color:#FFFFFF">addEventListener</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'click'</span><span style="color:#C9CEE6">, openFile)</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'File'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'scenario-group scenario-file'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">      openButton,</span></span>
<span class="line"><span style="color:#FFFFFF">      createDownloadButton</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createPrintButton</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    )</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // Thumbnails of the pages, in a sidebar on the left. It starts closed, leaving the pages the</span></span>
<span class="line"><span style="color:#A9AFCB">  // room.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> left </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createSidebar</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">    storage,</span></span>
<span class="line"><span style="color:#C9CEE6">    name: </span><span style="color:#E4FF4A">'redactions-left'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    side: </span><span style="color:#E4FF4A">'left'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    layout: </span><span style="color:#E4FF4A">'rail'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    panels: [{ id: </span><span style="color:#E4FF4A">'pages'</span><span style="color:#C9CEE6">, label: </span><span style="color:#E4FF4A">'Pages'</span><span style="color:#C9CEE6">, icon: Square }],</span></span>
<span class="line"><span style="color:#C9CEE6">    open: </span><span style="color:#E4FF4A">null</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    content: { pages: </span><span style="color:#FFFFFF">createThumbnails</span><span style="color:#C9CEE6">(viewer) },</span></span>
<span class="line"><span style="color:#FFFFFF">    onOpenChange</span><span style="color:#C9CEE6">: (open) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> left.controller.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">({ open }),</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // On the right, the plugin's open suggestions as the cards their marks open, and the ones</span></span>
<span class="line"><span style="color:#A9AFCB">  // accepted so far. Closed until Suggest has something to show.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> suggestions </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.</span><span style="color:#FFFFFF">records</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">'sandbox.suggestions'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#FFFFFF"> panels</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> (open</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> SidebarPanelInfo</span><span style="color:#C9CEE6">[] </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> [</span></span>
<span class="line"><span style="color:#C9CEE6">    { id: </span><span style="color:#E4FF4A">'suggestions'</span><span style="color:#C9CEE6">, label: </span><span style="color:#E4FF4A">'Suggestions'</span><span style="color:#C9CEE6">, icon: SquareDashed, badge: open },</span></span>
<span class="line"><span style="color:#C9CEE6">    { id: </span><span style="color:#E4FF4A">'accepted'</span><span style="color:#C9CEE6">, label: </span><span style="color:#E4FF4A">'Accepted'</span><span style="color:#C9CEE6">, icon: Check },</span></span>
<span class="line"><span style="color:#C9CEE6">  ]</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> accepted </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'div'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  accepted.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'accepted'</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> right </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createSidebar</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">    storage,</span></span>
<span class="line"><span style="color:#C9CEE6">    name: </span><span style="color:#E4FF4A">'redactions-right'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    side: </span><span style="color:#E4FF4A">'right'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    layout: </span><span style="color:#E4FF4A">'rail'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    panels: </span><span style="color:#FFFFFF">panels</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">0</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">    open: </span><span style="color:#E4FF4A">null</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    content: {</span></span>
<span class="line"><span style="color:#C9CEE6">      suggestions: </span><span style="color:#FFFFFF">createRecordList</span><span style="color:#C9CEE6">(viewer, { records: </span><span style="color:#E4FF4A">'sandbox.suggestions'</span><span style="color:#C9CEE6"> }),</span></span>
<span class="line"><span style="color:#C9CEE6">      accepted,</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#FFFFFF">    onOpenChange</span><span style="color:#C9CEE6">: (open) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> right.controller.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">({ open }),</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  /** Puts a suggestion back up for review and removes its redaction, in one undo step. */</span></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> undoAccept</span><span style="color:#C9CEE6">(suggestion</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#C9CEE6">    suggestions.</span><span style="color:#FFFFFF">batch</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">      suggestions.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">(suggestion.id, { status: </span><span style="color:#E4FF4A">'suggested'</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#9DABFF">      const</span><span style="color:#C9CEE6"> annotations </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.document.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()?.annotations</span></span>
<span class="line"><span style="color:#9DABFF">      for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> a </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> annotations?.list.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">() </span><span style="color:#9DABFF">??</span><span style="color:#C9CEE6"> [])</span></span>
<span class="line"><span style="color:#9DABFF">        if</span><span style="color:#C9CEE6"> (</span><span style="color:#FFFFFF">acceptedFrom</span><span style="color:#C9CEE6">(a) </span><span style="color:#9DABFF">===</span><span style="color:#C9CEE6"> suggestion.id) annotations?.</span><span style="color:#FFFFFF">remove</span><span style="color:#C9CEE6">(a.id)</span></span>
<span class="line"><span style="color:#C9CEE6">    })</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> showAccepted</span><span style="color:#C9CEE6">(list</span><span style="color:#9DABFF">:</span><span style="color:#9DABFF"> readonly</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">[])</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> items </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> list</span></span>
<span class="line"><span style="color:#C9CEE6">      .</span><span style="color:#FFFFFF">filter</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> s.status </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'accepted'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">      .</span><span style="color:#FFFFFF">map</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">        const</span><span style="color:#C9CEE6"> li </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'li'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">        const</span><span style="color:#C9CEE6"> reason </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'span'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">        reason.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'accepted-reason'</span></span>
<span class="line"><span style="color:#C9CEE6">        reason.textContent </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> s.reason</span></span>
<span class="line"><span style="color:#9DABFF">        const</span><span style="color:#C9CEE6"> meta </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'span'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">        meta.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'accepted-meta'</span></span>
<span class="line"><span style="color:#C9CEE6">        meta.textContent </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> \`\${</span><span style="color:#E4FF4A">s.</span><span style="color:#C9CEE6">text</span><span style="color:#E4FF4A">}, page \${</span><span style="color:#E4FF4A">s.</span><span style="color:#C9CEE6">page</span><span style="color:#9DABFF"> +</span><span style="color:#E4FF4A"> 1</span><span style="color:#E4FF4A">}\`</span></span>
<span class="line"><span style="color:#9DABFF">        const</span><span style="color:#C9CEE6"> undo </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'button'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">        undo.type </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'button'</span></span>
<span class="line"><span style="color:#C9CEE6">        undo.textContent </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'Undo accept'</span></span>
<span class="line"><span style="color:#C9CEE6">        undo.</span><span style="color:#FFFFFF">addEventListener</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'click'</span><span style="color:#C9CEE6">, () </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> undoAccept</span><span style="color:#C9CEE6">(s))</span></span>
<span class="line"><span style="color:#C9CEE6">        li.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(reason, meta, undo)</span></span>
<span class="line"><span style="color:#9DABFF">        return</span><span style="color:#C9CEE6"> li</span></span>
<span class="line"><span style="color:#C9CEE6">      })</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (items.length </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 0</span><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#9DABFF">      const</span><span style="color:#C9CEE6"> empty </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'p'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">      empty.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'accepted-empty'</span></span>
<span class="line"><span style="color:#C9CEE6">      empty.textContent </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'Nothing accepted yet.'</span></span>
<span class="line"><span style="color:#C9CEE6">      accepted.</span><span style="color:#FFFFFF">replaceChildren</span><span style="color:#C9CEE6">(empty)</span></span>
<span class="line"><span style="color:#C9CEE6">    } </span><span style="color:#9DABFF">else</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">      const</span><span style="color:#C9CEE6"> ul </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'ul'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">      ul.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">items)</span></span>
<span class="line"><span style="color:#C9CEE6">      accepted.</span><span style="color:#FFFFFF">replaceChildren</span><span style="color:#C9CEE6">(ul)</span></span>
<span class="line"><span style="color:#C9CEE6">    }</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> unfollowRecords </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> suggestions.list.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">((list) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    right.controller.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">      panels: </span><span style="color:#FFFFFF">panels</span><span style="color:#C9CEE6">(list.</span><span style="color:#FFFFFF">filter</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> s.status </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'suggested'</span><span style="color:#C9CEE6">).length),</span></span>
<span class="line"><span style="color:#C9CEE6">    })</span></span>
<span class="line"><span style="color:#FFFFFF">    showAccepted</span><span style="color:#C9CEE6">(list)</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // Suggest opens the Suggestions panel when it finishes.</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> wasBusy </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> false</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> unfollowBusy </span><span style="color:#9DABFF">=</span></span>
<span class="line"><span style="color:#C9CEE6">    suggest?.busy.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">((busy) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">      if</span><span style="color:#C9CEE6"> (wasBusy </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">busy) right.controller.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">({ open: </span><span style="color:#E4FF4A">'suggestions'</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#C9CEE6">      wasBusy </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> busy</span></span>
<span class="line"><span style="color:#C9CEE6">    }) </span><span style="color:#9DABFF">??</span><span style="color:#C9CEE6"> (() </span><span style="color:#9DABFF">=></span><span style="color:#E4FF4A"> undefined</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // The sidebars go either side of the pages.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> body </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'div'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  body.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'scenario-body'</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> viewport </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.element.</span><span style="color:#FFFFFF">querySelector</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'[data-ink-viewport-root]'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  viewport?.</span><span style="color:#FFFFFF">replaceWith</span><span style="color:#C9CEE6">(body)</span></span>
<span class="line"><span style="color:#C9CEE6">  body.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(left.element, </span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">(viewport </span><span style="color:#9DABFF">?</span><span style="color:#C9CEE6"> [viewport] </span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> []), right.element)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.</span><span style="color:#FFFFFF">prepend</span><span style="color:#C9CEE6">(tools)</span></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(status)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">    open</span><span style="color:#C9CEE6">: (next</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> DocumentSource</span><span style="color:#C9CEE6">) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> viewer.</span><span style="color:#FFFFFF">open</span><span style="color:#C9CEE6">(next),</span></span>
<span class="line"><span style="color:#FFFFFF">    setLanguage</span><span style="color:#C9CEE6">(m</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkMessagesInput</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> undefined, l</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string </span><span style="color:#9DABFF">|</span><span style="color:#C9CEE6"> undefined) {</span></span>
<span class="line"><span style="color:#C9CEE6">      viewer.</span><span style="color:#FFFFFF">setMessages</span><span style="color:#C9CEE6">(m)</span></span>
<span class="line"><span style="color:#C9CEE6">      viewer.</span><span style="color:#FFFFFF">setLocale</span><span style="color:#C9CEE6">(l)</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#FFFFFF">    destroy</span><span style="color:#C9CEE6">() {</span></span>
<span class="line"><span style="color:#FFFFFF">      unfollowCommand</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#FFFFFF">      unfollowRecords</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#FFFFFF">      unfollowBusy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      left.controller.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      right.controller.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      viewer.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Suggest redactions is a plugin (src/plugin/suggestions.ts). Register it in \`plugins\` and place
 * its command where you want with createCommandButton. Suggest adds the plugin's own records,
 * draws a mark on each and opens a card when you press one. Accept turns a suggestion into a
 * redaction. Thumbnails of the pages sit in a sidebar on the left. On the right, the plugin's
 * open suggestions as a list, and the ones accepted so far, written here on \`viewer.records\`.
 */
import {
  allTools,
  createColorMenu,
  createCommandButton,
  createHighlightMenu,
  createDownloadButton,
  createIcon,
  createPrintButton,
  createLineStyleMenu,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createRecordList,
  createRedo,
  createShapeMenu,
  createSidebar,
  createSignatureMenu,
  createTextStyleMenu,
  createThumbnails,
  createToolbar,
  createToolbarSeparator,
  createToolButton,
  createUndo,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
  type SidebarPanelInfo,
} from '@inkbar/core/dom'
import { Check, Square, SquareDashed } from '@inkbar/icons'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import {
  acceptedFrom,
  suggestionsPlugin,
  type Suggestion,
} from '../../plugin/suggestions'
import '../../plugin/suggestions.css'
import { FileUp } from '../../shared/file-up'
import { signatureFonts, storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { DocumentSource, InkMessagesInput } from '@inkbar/core'

function group(
  label: string,
  className: string,
  ...controls: HTMLElement[]
): HTMLElement {
  const g = document.createElement('div')
  g.className = className
  g.setAttribute('role', 'group')
  g.setAttribute('aria-label', label)
  g.append(...controls)
  return g
}

export function mount(
  el: HTMLElement,
  { source, messages, locale, log, onDocument, openFile }: ScenarioProps
) {
  const viewer = createViewer(el, {
    source,
    ...(messages ? { messages } : {}),
    ...(locale ? { locale } : {}),
    assets,
    tools: allTools(),
    plugins: [suggestionsPlugin()],
    storage,
    signatureFonts,
    onReady: (doc) => {
      log('onReady', { pages: doc.pages.length })
      onDocument(doc)
    },
    onActivate: (id) => log('onActivate', id),
  })
  viewer.element.classList.add('scenario-root')

  // Each result of the Suggest command arrives as its status.
  const suggest = viewer.commands.get('sandbox.suggest')
  const unfollowCommand =
    suggest?.status?.subscribe((status) => {
      if (status) log('command', status)
    }) ?? (() => undefined)

  const tools = createToolbar({ messages: viewer.messages })
  tools.classList.add('scenario-toolbar')
  tools.append(
    createHighlightMenu(viewer),
    group(
      'Tools',
      'scenario-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select'),
      createToolButton(viewer, 'redact-area'),
      createToolButton(viewer, 'sketch'),
      createToolButton(viewer, 'draw'),
      createShapeMenu(viewer),
      createToolButton(viewer, 'freetext'),
      createSignatureMenu(viewer),
      createToolButton(viewer, 'note')
    ),
    createToolbarSeparator(),
    group(
      'Style',
      'scenario-group',
      createLineStyleMenu(viewer),
      createColorMenu(viewer, { property: 'border' }),
      createColorMenu(viewer, { property: 'fill' }),
      createTextStyleMenu(viewer)
    ),
    createUndo(viewer),
    createRedo(viewer),
    group('Suggest', 'scenario-actions', createCommandButton(viewer, 'sandbox.suggest'))
  )

  const status = createToolbar({ label: 'Page and zoom' })
  status.classList.add('scenario-status-bar')
  status.append(
    group(
      'Page',
      'scenario-group',
      createPrevPage(viewer),
      createPageInput(viewer),
      createPageCount(viewer),
      createNextPage(viewer)
    ),
    group(
      'Zoom',
      'scenario-group scenario-zoom',
      createZoomOut(viewer),
      createZoomSelect(viewer),
      createZoomIn(viewer)
    )
  )

  // Your own button joins the toolbar like the built-in ones: arrow keys reach it.
  const openButton = document.createElement('button')
  openButton.type = 'button'
  openButton.setAttribute('aria-label', 'Open a PDF')
  openButton.title = 'Open a PDF'
  openButton.append(createIcon(FileUp), 'Open')
  openButton.addEventListener('click', openFile)
  tools.append(
    group(
      'File',
      'scenario-group scenario-file',
      openButton,
      createDownloadButton(viewer),
      createPrintButton(viewer)
    )
  )

  // Thumbnails of the pages, in a sidebar on the left. It starts closed, leaving the pages the
  // room.
  const left = createSidebar({
    storage,
    name: 'redactions-left',
    side: 'left',
    layout: 'rail',
    panels: [{ id: 'pages', label: 'Pages', icon: Square }],
    open: null,
    content: { pages: createThumbnails(viewer) },
    onOpenChange: (open) => left.controller.update({ open }),
  })

  // On the right, the plugin's open suggestions as the cards their marks open, and the ones
  // accepted so far. Closed until Suggest has something to show.
  const suggestions = viewer.records<Suggestion>('sandbox.suggestions')
  const panels = (open: number): SidebarPanelInfo[] => [
    { id: 'suggestions', label: 'Suggestions', icon: SquareDashed, badge: open },
    { id: 'accepted', label: 'Accepted', icon: Check },
  ]
  const accepted = document.createElement('div')
  accepted.className = 'accepted'
  const right = createSidebar({
    storage,
    name: 'redactions-right',
    side: 'right',
    layout: 'rail',
    panels: panels(0),
    open: null,
    content: {
      suggestions: createRecordList(viewer, { records: 'sandbox.suggestions' }),
      accepted,
    },
    onOpenChange: (open) => right.controller.update({ open }),
  })

  /** Puts a suggestion back up for review and removes its redaction, in one undo step. */
  function undoAccept(suggestion: Suggestion): void {
    suggestions.batch(() => {
      suggestions.update(suggestion.id, { status: 'suggested' })
      const annotations = viewer.document.get()?.annotations
      for (const a of annotations?.list.get() ?? [])
        if (acceptedFrom(a) === suggestion.id) annotations?.remove(a.id)
    })
  }

  function showAccepted(list: readonly Suggestion[]): void {
    const items = list
      .filter((s) => s.status === 'accepted')
      .map((s) => {
        const li = document.createElement('li')
        const reason = document.createElement('span')
        reason.className = 'accepted-reason'
        reason.textContent = s.reason
        const meta = document.createElement('span')
        meta.className = 'accepted-meta'
        meta.textContent = \`\${s.text}, page \${s.page + 1}\`
        const undo = document.createElement('button')
        undo.type = 'button'
        undo.textContent = 'Undo accept'
        undo.addEventListener('click', () => undoAccept(s))
        li.append(reason, meta, undo)
        return li
      })
    if (items.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'accepted-empty'
      empty.textContent = 'Nothing accepted yet.'
      accepted.replaceChildren(empty)
    } else {
      const ul = document.createElement('ul')
      ul.append(...items)
      accepted.replaceChildren(ul)
    }
  }

  const unfollowRecords = suggestions.list.subscribe((list) => {
    right.controller.update({
      panels: panels(list.filter((s) => s.status === 'suggested').length),
    })
    showAccepted(list)
  })

  // Suggest opens the Suggestions panel when it finishes.
  let wasBusy = false
  const unfollowBusy =
    suggest?.busy.subscribe((busy) => {
      if (wasBusy && !busy) right.controller.update({ open: 'suggestions' })
      wasBusy = busy
    }) ?? (() => undefined)

  // The sidebars go either side of the pages.
  const body = document.createElement('div')
  body.className = 'scenario-body'
  const viewport = viewer.element.querySelector('[data-ink-viewport-root]')
  viewport?.replaceWith(body)
  body.append(left.element, ...(viewport ? [viewport] : []), right.element)

  viewer.element.prepend(tools)
  viewer.element.append(status)

  return {
    open: (next: DocumentSource) => viewer.open(next),
    setLanguage(m: InkMessagesInput | undefined, l: string | undefined) {
      viewer.setMessages(m)
      viewer.setLocale(l)
    },
    destroy() {
      unfollowCommand()
      unfollowRecords()
      unfollowBusy()
      left.controller.destroy()
      right.controller.destroy()
      viewer.destroy()
    },
  }
}
`};export{e as default};