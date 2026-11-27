var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails</span></span>
<span class="line"><span style="color:#A9AFCB"> * and Search finds text; About on the right is your own element. Layout switches both</span></span>
<span class="line"><span style="color:#A9AFCB"> * sidebars between a rail, tabs and a stack.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  createDownloadButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPrintButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createSearchResults,</span></span>
<span class="line"><span style="color:#C9CEE6">  createSidebar,</span></span>
<span class="line"><span style="color:#C9CEE6">  createThumbnails,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createViewer,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomSelect,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> SidebarLayout,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> SidebarPanelInfo,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { Info, Search, Square } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/icons'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { FileUp } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/file-up'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { storage } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/signatures'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioLabels } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/strings/types'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { DocumentSource, InkMessagesInput } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> mount</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">  el</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  { source, messages, locale, labels, log, onDocument, openFile }</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioProps</span></span>
<span class="line"><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#A9AFCB">  /** The groups this file names itself, each with its name in a set of labels. */</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> groups</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> [</span><span style="color:#FFFFFF">HTMLElement</span><span style="color:#C9CEE6">, (words</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioLabels</span><span style="color:#C9CEE6">) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> string][] </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> []</span></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    label</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> (words</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioLabels</span><span style="color:#C9CEE6">) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> string,</span></span>
<span class="line"><span style="color:#C9CEE6">    className</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string,</span></span>
<span class="line"><span style="color:#9DABFF">    ...</span><span style="color:#C9CEE6">controls</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">[]</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> g </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'div'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    g.className </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> className</span></span>
<span class="line"><span style="color:#C9CEE6">    g.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'role'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'group'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    g.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">controls)</span></span>
<span class="line"><span style="color:#C9CEE6">    groups.</span><span style="color:#FFFFFF">push</span><span style="color:#C9CEE6">([g, label])</span></span>
<span class="line"><span style="color:#9DABFF">    return</span><span style="color:#C9CEE6"> g</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> viewer </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createViewer</span><span style="color:#C9CEE6">(el, {</span></span>
<span class="line"><span style="color:#C9CEE6">    storage,</span></span>
<span class="line"><span style="color:#C9CEE6">    source,</span></span>
<span class="line"><span style="color:#9DABFF">    ...</span><span style="color:#C9CEE6">(messages </span><span style="color:#9DABFF">?</span><span style="color:#C9CEE6"> { messages } </span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> {}),</span></span>
<span class="line"><span style="color:#9DABFF">    ...</span><span style="color:#C9CEE6">(locale </span><span style="color:#9DABFF">?</span><span style="color:#C9CEE6"> { locale } </span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> {}),</span></span>
<span class="line"><span style="color:#C9CEE6">    assets,</span></span>
<span class="line"><span style="color:#FFFFFF">    onReady</span><span style="color:#C9CEE6">: (doc) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">      log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onReady'</span><span style="color:#C9CEE6">, { pages: doc.pages.length })</span></span>
<span class="line"><span style="color:#FFFFFF">      onDocument</span><span style="color:#C9CEE6">(doc)</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'scenario-root'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // The layout picker: a select of your own, setting both sidebars.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> picker </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'select'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  picker.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'ink-select'</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> options </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    rail: </span><span style="color:#9DABFF">new</span><span style="color:#FFFFFF"> Option</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">''</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'rail'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">    tabs: </span><span style="color:#9DABFF">new</span><span style="color:#FFFFFF"> Option</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">''</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'tabs'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">    stack: </span><span style="color:#9DABFF">new</span><span style="color:#FFFFFF"> Option</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">''</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'stack'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">  picker.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(options.rail, options.tabs, options.stack)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> layoutText </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createTextNode</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">''</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> layoutLabel </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'label'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  layoutLabel.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'scenario-layout'</span></span>
<span class="line"><span style="color:#C9CEE6">  layoutLabel.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(layoutText, picker)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> tools </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createToolbar</span><span style="color:#C9CEE6">({ messages: viewer.messages })</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'scenario-toolbar'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">      (w) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> w.tools,</span></span>
<span class="line"><span style="color:#E4FF4A">      'scenario-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'select-text'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'select'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#C9CEE6">    layoutLabel</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> status </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createToolbar</span><span style="color:#C9CEE6">({ label: labels.pageAndZoom })</span></span>
<span class="line"><span style="color:#C9CEE6">  status.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'scenario-status-bar'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  status.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">      (w) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> w.page,</span></span>
<span class="line"><span style="color:#E4FF4A">      'scenario-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createPrevPage</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createPageInput</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createPageCount</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createNextPage</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">      (w) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> w.zoom,</span></span>
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
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> openText </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createTextNode</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">''</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  openButton.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span><span style="color:#FFFFFF">createIcon</span><span style="color:#C9CEE6">(FileUp), openText)</span></span>
<span class="line"><span style="color:#C9CEE6">  openButton.</span><span style="color:#FFFFFF">addEventListener</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'click'</span><span style="color:#C9CEE6">, openFile)</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">      (w) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> w.file,</span></span>
<span class="line"><span style="color:#E4FF4A">      'scenario-group scenario-file'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">      openButton,</span></span>
<span class="line"><span style="color:#FFFFFF">      createDownloadButton</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createPrintButton</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    )</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // Thumbnails and search on the left; your own About on the right.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#FFFFFF"> leftPanels</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> (words</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioLabels</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> SidebarPanelInfo</span><span style="color:#C9CEE6">[] </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> [</span></span>
<span class="line"><span style="color:#C9CEE6">    { id: </span><span style="color:#E4FF4A">'pages'</span><span style="color:#C9CEE6">, label: words.pages, icon: Square },</span></span>
<span class="line"><span style="color:#C9CEE6">    { id: </span><span style="color:#E4FF4A">'search'</span><span style="color:#C9CEE6">, label: words.search, icon: Search },</span></span>
<span class="line"><span style="color:#C9CEE6">  ]</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#FFFFFF"> rightPanels</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> (words</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioLabels</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> SidebarPanelInfo</span><span style="color:#C9CEE6">[] </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> [</span></span>
<span class="line"><span style="color:#C9CEE6">    { id: </span><span style="color:#E4FF4A">'about'</span><span style="color:#C9CEE6">, label: words.about, icon: Info },</span></span>
<span class="line"><span style="color:#C9CEE6">  ]</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> left </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createSidebar</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">    storage,</span></span>
<span class="line"><span style="color:#C9CEE6">    name: </span><span style="color:#E4FF4A">'sidebars-left'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    side: </span><span style="color:#E4FF4A">'left'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    layout: </span><span style="color:#E4FF4A">'rail'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    panels: </span><span style="color:#FFFFFF">leftPanels</span><span style="color:#C9CEE6">(labels),</span></span>
<span class="line"><span style="color:#C9CEE6">    content: { pages: </span><span style="color:#FFFFFF">createThumbnails</span><span style="color:#C9CEE6">(viewer), search: </span><span style="color:#FFFFFF">createSearchResults</span><span style="color:#C9CEE6">(viewer) },</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> about </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'div'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  about.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'sidebar-about'</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> aboutFill </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'p'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> aboutRecords </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'p'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  about.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(aboutFill, aboutRecords)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> right </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createSidebar</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">    storage,</span></span>
<span class="line"><span style="color:#C9CEE6">    name: </span><span style="color:#E4FF4A">'sidebars-right'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    side: </span><span style="color:#E4FF4A">'right'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    layout: </span><span style="color:#E4FF4A">'rail'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    panels: </span><span style="color:#FFFFFF">rightPanels</span><span style="color:#C9CEE6">(labels),</span></span>
<span class="line"><span style="color:#C9CEE6">    content: { about },</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">  picker.</span><span style="color:#FFFFFF">addEventListener</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'change'</span><span style="color:#C9CEE6">, () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> layout </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> picker.value </span><span style="color:#9DABFF">as</span><span style="color:#FFFFFF"> SidebarLayout</span></span>
<span class="line"><span style="color:#C9CEE6">    left.controller.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">({ layout })</span></span>
<span class="line"><span style="color:#C9CEE6">    right.controller.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">({ layout })</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
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
<span class="line"><span style="color:#A9AFCB">  /** Writes the words this file supplies itself; a change of language writes them again. */</span></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> showLabels</span><span style="color:#C9CEE6">(words</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioLabels</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">    for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> [g, label] </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> groups) g.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, </span><span style="color:#FFFFFF">label</span><span style="color:#C9CEE6">(words))</span></span>
<span class="line"><span style="color:#C9CEE6">    status.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, words.pageAndZoom)</span></span>
<span class="line"><span style="color:#C9CEE6">    openButton.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, words.openPdf)</span></span>
<span class="line"><span style="color:#C9CEE6">    openButton.title </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> words.openPdf</span></span>
<span class="line"><span style="color:#C9CEE6">    openText.data </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> words.open</span></span>
<span class="line"><span style="color:#C9CEE6">    layoutText.data </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> words.layout</span></span>
<span class="line"><span style="color:#C9CEE6">    options.rail.text </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> words.rail</span></span>
<span class="line"><span style="color:#C9CEE6">    options.tabs.text </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> words.tabs</span></span>
<span class="line"><span style="color:#C9CEE6">    options.stack.text </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> words.stack</span></span>
<span class="line"><span style="color:#C9CEE6">    aboutFill.textContent </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> words.aboutFill</span></span>
<span class="line"><span style="color:#C9CEE6">    aboutRecords.textContent </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> words.aboutRecords</span></span>
<span class="line"><span style="color:#C9CEE6">    left.controller.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">({ panels: </span><span style="color:#FFFFFF">leftPanels</span><span style="color:#C9CEE6">(words) })</span></span>
<span class="line"><span style="color:#C9CEE6">    right.controller.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">({ panels: </span><span style="color:#FFFFFF">rightPanels</span><span style="color:#C9CEE6">(words) })</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#FFFFFF">  showLabels</span><span style="color:#C9CEE6">(labels)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">    open</span><span style="color:#C9CEE6">: (next</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> DocumentSource</span><span style="color:#C9CEE6">) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> viewer.</span><span style="color:#FFFFFF">open</span><span style="color:#C9CEE6">(next),</span></span>
<span class="line"><span style="color:#FFFFFF">    setLanguage</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">      m</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkMessagesInput</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> undefined,</span></span>
<span class="line"><span style="color:#C9CEE6">      l</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string </span><span style="color:#9DABFF">|</span><span style="color:#C9CEE6"> undefined,</span></span>
<span class="line"><span style="color:#C9CEE6">      words</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioLabels</span></span>
<span class="line"><span style="color:#C9CEE6">    ) {</span></span>
<span class="line"><span style="color:#FFFFFF">      showLabels</span><span style="color:#C9CEE6">(words)</span></span>
<span class="line"><span style="color:#C9CEE6">      viewer.</span><span style="color:#FFFFFF">setMessages</span><span style="color:#C9CEE6">(m)</span></span>
<span class="line"><span style="color:#C9CEE6">      viewer.</span><span style="color:#FFFFFF">setLocale</span><span style="color:#C9CEE6">(l)</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#FFFFFF">    destroy</span><span style="color:#C9CEE6">() {</span></span>
<span class="line"><span style="color:#C9CEE6">      left.controller.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      right.controller.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      viewer.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails
 * and Search finds text; About on the right is your own element. Layout switches both
 * sidebars between a rail, tabs and a stack.
 */
import {
  createDownloadButton,
  createIcon,
  createPrintButton,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createSearchResults,
  createSidebar,
  createThumbnails,
  createToolbar,
  createToolButton,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
  type SidebarLayout,
  type SidebarPanelInfo,
} from '@inkbar/core/dom'
import { Info, Search, Square } from '@inkbar/icons'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { ScenarioLabels } from '../../shared/strings/types'
import type { DocumentSource, InkMessagesInput } from '@inkbar/core'

export function mount(
  el: HTMLElement,
  { source, messages, locale, labels, log, onDocument, openFile }: ScenarioProps
) {
  /** The groups this file names itself, each with its name in a set of labels. */
  const groups: [HTMLElement, (words: ScenarioLabels) => string][] = []
  function group(
    label: (words: ScenarioLabels) => string,
    className: string,
    ...controls: HTMLElement[]
  ): HTMLElement {
    const g = document.createElement('div')
    g.className = className
    g.setAttribute('role', 'group')
    g.append(...controls)
    groups.push([g, label])
    return g
  }

  const viewer = createViewer(el, {
    storage,
    source,
    ...(messages ? { messages } : {}),
    ...(locale ? { locale } : {}),
    assets,
    onReady: (doc) => {
      log('onReady', { pages: doc.pages.length })
      onDocument(doc)
    },
  })
  viewer.element.classList.add('scenario-root')

  // The layout picker: a select of your own, setting both sidebars.
  const picker = document.createElement('select')
  picker.className = 'ink-select'
  const options = {
    rail: new Option('', 'rail'),
    tabs: new Option('', 'tabs'),
    stack: new Option('', 'stack'),
  }
  picker.append(options.rail, options.tabs, options.stack)
  const layoutText = document.createTextNode('')
  const layoutLabel = document.createElement('label')
  layoutLabel.className = 'scenario-layout'
  layoutLabel.append(layoutText, picker)

  const tools = createToolbar({ messages: viewer.messages })
  tools.classList.add('scenario-toolbar')
  tools.append(
    group(
      (w) => w.tools,
      'scenario-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select')
    ),
    layoutLabel
  )

  const status = createToolbar({ label: labels.pageAndZoom })
  status.classList.add('scenario-status-bar')
  status.append(
    group(
      (w) => w.page,
      'scenario-group',
      createPrevPage(viewer),
      createPageInput(viewer),
      createPageCount(viewer),
      createNextPage(viewer)
    ),
    group(
      (w) => w.zoom,
      'scenario-group scenario-zoom',
      createZoomOut(viewer),
      createZoomSelect(viewer),
      createZoomIn(viewer)
    )
  )

  // Your own button joins the toolbar like the built-in ones: arrow keys reach it.
  const openButton = document.createElement('button')
  openButton.type = 'button'
  const openText = document.createTextNode('')
  openButton.append(createIcon(FileUp), openText)
  openButton.addEventListener('click', openFile)
  tools.append(
    group(
      (w) => w.file,
      'scenario-group scenario-file',
      openButton,
      createDownloadButton(viewer),
      createPrintButton(viewer)
    )
  )

  // Thumbnails and search on the left; your own About on the right.
  const leftPanels = (words: ScenarioLabels): SidebarPanelInfo[] => [
    { id: 'pages', label: words.pages, icon: Square },
    { id: 'search', label: words.search, icon: Search },
  ]
  const rightPanels = (words: ScenarioLabels): SidebarPanelInfo[] => [
    { id: 'about', label: words.about, icon: Info },
  ]
  const left = createSidebar({
    storage,
    name: 'sidebars-left',
    side: 'left',
    layout: 'rail',
    panels: leftPanels(labels),
    content: { pages: createThumbnails(viewer), search: createSearchResults(viewer) },
  })

  const about = document.createElement('div')
  about.className = 'sidebar-about'
  const aboutFill = document.createElement('p')
  const aboutRecords = document.createElement('p')
  about.append(aboutFill, aboutRecords)
  const right = createSidebar({
    storage,
    name: 'sidebars-right',
    side: 'right',
    layout: 'rail',
    panels: rightPanels(labels),
    content: { about },
  })

  picker.addEventListener('change', () => {
    const layout = picker.value as SidebarLayout
    left.controller.update({ layout })
    right.controller.update({ layout })
  })

  // The sidebars go either side of the pages.
  const body = document.createElement('div')
  body.className = 'scenario-body'
  const viewport = viewer.element.querySelector('[data-ink-viewport-root]')
  viewport?.replaceWith(body)
  body.append(left.element, ...(viewport ? [viewport] : []), right.element)

  viewer.element.prepend(tools)
  viewer.element.append(status)

  /** Writes the words this file supplies itself; a change of language writes them again. */
  function showLabels(words: ScenarioLabels): void {
    for (const [g, label] of groups) g.setAttribute('aria-label', label(words))
    status.setAttribute('aria-label', words.pageAndZoom)
    openButton.setAttribute('aria-label', words.openPdf)
    openButton.title = words.openPdf
    openText.data = words.open
    layoutText.data = words.layout
    options.rail.text = words.rail
    options.tabs.text = words.tabs
    options.stack.text = words.stack
    aboutFill.textContent = words.aboutFill
    aboutRecords.textContent = words.aboutRecords
    left.controller.update({ panels: leftPanels(words) })
    right.controller.update({ panels: rightPanels(words) })
  }
  showLabels(labels)

  return {
    open: (next: DocumentSource) => viewer.open(next),
    setLanguage(
      m: InkMessagesInput | undefined,
      l: string | undefined,
      words: ScenarioLabels
    ) {
      showLabels(words)
      viewer.setMessages(m)
      viewer.setLocale(l)
    },
    destroy() {
      left.controller.destroy()
      right.controller.destroy()
      viewer.destroy()
    },
  }
}
`};export{e as default};