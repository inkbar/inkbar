var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails,</span></span>
<span class="line"><span style="color:#A9AFCB"> * Search finds text, and Notes and Keys are your own elements. Layout switches both sidebars</span></span>
<span class="line"><span style="color:#A9AFCB"> * between a rail, tabs and a stack; a closed panel keeps its content, so a note stays put.</span></span>
<span class="line"><span style="color:#A9AFCB"> * Remove pages… opens a dialog of your own with one createThumbnail per page inside its</span></span>
<span class="line"><span style="color:#A9AFCB"> * checkbox label. It removes nothing: Remove only closes it.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  createIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">  createNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createSearchResults,</span></span>
<span class="line"><span style="color:#C9CEE6">  createSidebar,</span></span>
<span class="line"><span style="color:#C9CEE6">  createThumbnail,</span></span>
<span class="line"><span style="color:#C9CEE6">  createThumbnails,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createViewer,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomSelect,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> SidebarLayout,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { MessageSquareText, Search, Square, Type } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/icons'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { FileUp } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/file-up'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { DocumentSource } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> KEYS</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Record</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">SidebarLayout</span><span style="color:#C9CEE6">, string> </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  rail: </span><span style="color:#E4FF4A">'Up and Down move between the buttons, Home and End go to the first and last, and Enter or Space opens a panel, or closes the open one.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  tabs: </span><span style="color:#E4FF4A">'Left and Right move between the tabs, Home and End go to the first and last, and Enter or Space opens one.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  stack:</span></span>
<span class="line"><span style="color:#E4FF4A">    'Each header is a Tab stop. Up and Down move between them, and Enter or Space expands or collapses a section.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
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
<span class="line"><span style="color:#C9CEE6">  { source, log, onDocument, openFile }</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioProps</span></span>
<span class="line"><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> viewer </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createViewer</span><span style="color:#C9CEE6">(el, {</span></span>
<span class="line"><span style="color:#C9CEE6">    source,</span></span>
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
<span class="line"><span style="color:#9DABFF">  for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> [value, text] </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> [</span></span>
<span class="line"><span style="color:#C9CEE6">    [</span><span style="color:#E4FF4A">'rail'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Rail'</span><span style="color:#C9CEE6">],</span></span>
<span class="line"><span style="color:#C9CEE6">    [</span><span style="color:#E4FF4A">'tabs'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Tabs'</span><span style="color:#C9CEE6">],</span></span>
<span class="line"><span style="color:#C9CEE6">    [</span><span style="color:#E4FF4A">'stack'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Stack'</span><span style="color:#C9CEE6">],</span></span>
<span class="line"><span style="color:#C9CEE6">  ] </span><span style="color:#9DABFF">as</span><span style="color:#9DABFF"> const</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    picker.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span><span style="color:#9DABFF">new</span><span style="color:#FFFFFF"> Option</span><span style="color:#C9CEE6">(text, value))</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> layoutLabel </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'label'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  layoutLabel.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'scenario-layout'</span></span>
<span class="line"><span style="color:#C9CEE6">  layoutLabel.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Layout'</span><span style="color:#C9CEE6">, picker)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> removeButton </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'button'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  removeButton.type </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'button'</span></span>
<span class="line"><span style="color:#C9CEE6">  removeButton.textContent </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'Remove pages…'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> tools </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createToolbar</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'scenario-toolbar'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Tools'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'scenario-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'select-text'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'select'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#C9CEE6">    layoutLabel,</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Pages'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'scenario-actions'</span><span style="color:#C9CEE6">, removeButton)</span></span>
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
<span class="line"><span style="color:#C9CEE6">  tools.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span><span style="color:#FFFFFF">group</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'File'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'scenario-group scenario-file'</span><span style="color:#C9CEE6">, openButton))</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // Thumbnails and search on the left; your own Notes and Keys on the right.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> left </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createSidebar</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">    side: </span><span style="color:#E4FF4A">'left'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    layout: </span><span style="color:#E4FF4A">'rail'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    panels: [</span></span>
<span class="line"><span style="color:#C9CEE6">      { id: </span><span style="color:#E4FF4A">'pages'</span><span style="color:#C9CEE6">, label: </span><span style="color:#E4FF4A">'Pages'</span><span style="color:#C9CEE6">, icon: Square },</span></span>
<span class="line"><span style="color:#C9CEE6">      { id: </span><span style="color:#E4FF4A">'search'</span><span style="color:#C9CEE6">, label: </span><span style="color:#E4FF4A">'Search'</span><span style="color:#C9CEE6">, icon: Search },</span></span>
<span class="line"><span style="color:#C9CEE6">    ],</span></span>
<span class="line"><span style="color:#C9CEE6">    content: { pages: </span><span style="color:#FFFFFF">createThumbnails</span><span style="color:#C9CEE6">(viewer), search: </span><span style="color:#FFFFFF">createSearchResults</span><span style="color:#C9CEE6">(viewer) },</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> notes </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'div'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  notes.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'sidebar-notes'</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> textarea </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'textarea'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  textarea.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Notes'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  textarea.placeholder </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'Anything to remember'</span></span>
<span class="line"><span style="color:#C9CEE6">  notes.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(textarea)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> keys </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'p'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  keys.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'sidebar-keys'</span></span>
<span class="line"><span style="color:#C9CEE6">  keys.textContent </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> KEYS.rail</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> right </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createSidebar</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">    side: </span><span style="color:#E4FF4A">'right'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    layout: </span><span style="color:#E4FF4A">'rail'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    panels: [</span></span>
<span class="line"><span style="color:#C9CEE6">      { id: </span><span style="color:#E4FF4A">'notes'</span><span style="color:#C9CEE6">, label: </span><span style="color:#E4FF4A">'Notes'</span><span style="color:#C9CEE6">, icon: MessageSquareText },</span></span>
<span class="line"><span style="color:#C9CEE6">      { id: </span><span style="color:#E4FF4A">'keys'</span><span style="color:#C9CEE6">, label: </span><span style="color:#E4FF4A">'Keys'</span><span style="color:#C9CEE6">, icon: Type },</span></span>
<span class="line"><span style="color:#C9CEE6">    ],</span></span>
<span class="line"><span style="color:#C9CEE6">    content: { notes, keys },</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">  picker.</span><span style="color:#FFFFFF">addEventListener</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'change'</span><span style="color:#C9CEE6">, () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> layout </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> picker.value </span><span style="color:#9DABFF">as</span><span style="color:#FFFFFF"> SidebarLayout</span></span>
<span class="line"><span style="color:#C9CEE6">    left.controller.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">({ layout })</span></span>
<span class="line"><span style="color:#C9CEE6">    right.controller.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">({ layout })</span></span>
<span class="line"><span style="color:#C9CEE6">    keys.textContent </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> KEYS[layout]</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // The dialog: a checkbox per page, its label wrapped around a thumbnail of the page.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> dialog </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'dialog'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  dialog.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'remove-pages'</span></span>
<span class="line"><span style="color:#C9CEE6">  dialog.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-labelledby'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'remove-pages-title'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> form </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'form'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  form.method </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'dialog'</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> title </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'h2'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  title.id </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'remove-pages-title'</span></span>
<span class="line"><span style="color:#C9CEE6">  title.textContent </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'Remove pages'</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> list </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'ul'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> actions </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'div'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  actions.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'remove-pages-actions'</span></span>
<span class="line"><span style="color:#9DABFF">  for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> [value, text] </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> [</span></span>
<span class="line"><span style="color:#C9CEE6">    [</span><span style="color:#E4FF4A">'cancel'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Cancel'</span><span style="color:#C9CEE6">],</span></span>
<span class="line"><span style="color:#C9CEE6">    [</span><span style="color:#E4FF4A">'remove'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Remove'</span><span style="color:#C9CEE6">],</span></span>
<span class="line"><span style="color:#C9CEE6">  ]) {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> b </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'button'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    b.value </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> value</span><span style="color:#9DABFF">!</span></span>
<span class="line"><span style="color:#C9CEE6">    b.textContent </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> text</span><span style="color:#9DABFF">!</span></span>
<span class="line"><span style="color:#C9CEE6">    actions.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(b)</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">  form.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(title, list, actions)</span></span>
<span class="line"><span style="color:#C9CEE6">  dialog.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(form)</span></span>
<span class="line"><span style="color:#C9CEE6">  removeButton.</span><span style="color:#FFFFFF">addEventListener</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'click'</span><span style="color:#C9CEE6">, () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> dialog.</span><span style="color:#FFFFFF">showModal</span><span style="color:#C9CEE6">())</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // A thumbnail follows the open document, so each page's item is made once and kept.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> items</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLLIElement</span><span style="color:#C9CEE6">[] </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> []</span></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> item</span><span style="color:#C9CEE6">(page</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLLIElement</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> li </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'li'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> label </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'label'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> box </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'input'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    box.type </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'checkbox'</span></span>
<span class="line"><span style="color:#C9CEE6">    box.value </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> String</span><span style="color:#C9CEE6">(page)</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> number </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'span'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    number.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-hidden'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'true'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    number.textContent </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> String</span><span style="color:#C9CEE6">(page </span><span style="color:#9DABFF">+</span><span style="color:#E4FF4A"> 1</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    label.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(box, </span><span style="color:#FFFFFF">createThumbnail</span><span style="color:#C9CEE6">(viewer, { page, width: </span><span style="color:#E4FF4A">96</span><span style="color:#C9CEE6"> }), number)</span></span>
<span class="line"><span style="color:#C9CEE6">    li.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(label)</span></span>
<span class="line"><span style="color:#9DABFF">    return</span><span style="color:#C9CEE6"> li</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> unfollowDocument </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.document.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">((doc) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> count </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> doc?.pages.length </span><span style="color:#9DABFF">??</span><span style="color:#E4FF4A"> 0</span></span>
<span class="line"><span style="color:#9DABFF">    for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">let</span><span style="color:#C9CEE6"> page </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> items.length; page </span><span style="color:#9DABFF">&#x3C;</span><span style="color:#C9CEE6"> count; page</span><span style="color:#9DABFF">++</span><span style="color:#C9CEE6">) items.</span><span style="color:#FFFFFF">push</span><span style="color:#C9CEE6">(</span><span style="color:#FFFFFF">item</span><span style="color:#C9CEE6">(page))</span></span>
<span class="line"><span style="color:#C9CEE6">    list.</span><span style="color:#FFFFFF">replaceChildren</span><span style="color:#C9CEE6">(</span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">items.</span><span style="color:#FFFFFF">slice</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">0</span><span style="color:#C9CEE6">, count))</span></span>
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
<span class="line"><span style="color:#C9CEE6">  viewer.element.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(status, dialog)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">    open</span><span style="color:#C9CEE6">: (next</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> DocumentSource</span><span style="color:#C9CEE6">) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> viewer.</span><span style="color:#FFFFFF">open</span><span style="color:#C9CEE6">(next),</span></span>
<span class="line"><span style="color:#FFFFFF">    destroy</span><span style="color:#C9CEE6">() {</span></span>
<span class="line"><span style="color:#FFFFFF">      unfollowDocument</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      left.controller.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      right.controller.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      viewer.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails,
 * Search finds text, and Notes and Keys are your own elements. Layout switches both sidebars
 * between a rail, tabs and a stack; a closed panel keeps its content, so a note stays put.
 * Remove pages… opens a dialog of your own with one createThumbnail per page inside its
 * checkbox label. It removes nothing: Remove only closes it.
 */
import {
  createIcon,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createSearchResults,
  createSidebar,
  createThumbnail,
  createThumbnails,
  createToolbar,
  createToolButton,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
  type SidebarLayout,
} from '@inkbar/core/dom'
import { MessageSquareText, Search, Square, Type } from '@inkbar/icons'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'

import type { ScenarioProps } from '../../frameworks/types'
import type { DocumentSource } from '@inkbar/core'

const KEYS: Record<SidebarLayout, string> = {
  rail: 'Up and Down move between the buttons, Home and End go to the first and last, and Enter or Space opens a panel, or closes the open one.',
  tabs: 'Left and Right move between the tabs, Home and End go to the first and last, and Enter or Space opens one.',
  stack:
    'Each header is a Tab stop. Up and Down move between them, and Enter or Space expands or collapses a section.',
}

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
  { source, log, onDocument, openFile }: ScenarioProps
) {
  const viewer = createViewer(el, {
    source,
    assets,
    onReady: (doc) => {
      log('onReady', { pages: doc.pages.length })
      onDocument(doc)
    },
  })
  viewer.element.classList.add('scenario-root')

  // The layout picker: a select of your own, setting both sidebars.
  const picker = document.createElement('select')
  for (const [value, text] of [
    ['rail', 'Rail'],
    ['tabs', 'Tabs'],
    ['stack', 'Stack'],
  ] as const)
    picker.append(new Option(text, value))
  const layoutLabel = document.createElement('label')
  layoutLabel.className = 'scenario-layout'
  layoutLabel.append('Layout', picker)

  const removeButton = document.createElement('button')
  removeButton.type = 'button'
  removeButton.textContent = 'Remove pages…'

  const tools = createToolbar()
  tools.classList.add('scenario-toolbar')
  tools.append(
    group(
      'Tools',
      'scenario-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select')
    ),
    layoutLabel,
    group('Pages', 'scenario-actions', removeButton)
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
  tools.append(group('File', 'scenario-group scenario-file', openButton))

  // Thumbnails and search on the left; your own Notes and Keys on the right.
  const left = createSidebar({
    side: 'left',
    layout: 'rail',
    panels: [
      { id: 'pages', label: 'Pages', icon: Square },
      { id: 'search', label: 'Search', icon: Search },
    ],
    content: { pages: createThumbnails(viewer), search: createSearchResults(viewer) },
  })

  const notes = document.createElement('div')
  notes.className = 'sidebar-notes'
  const textarea = document.createElement('textarea')
  textarea.setAttribute('aria-label', 'Notes')
  textarea.placeholder = 'Anything to remember'
  notes.append(textarea)
  const keys = document.createElement('p')
  keys.className = 'sidebar-keys'
  keys.textContent = KEYS.rail
  const right = createSidebar({
    side: 'right',
    layout: 'rail',
    panels: [
      { id: 'notes', label: 'Notes', icon: MessageSquareText },
      { id: 'keys', label: 'Keys', icon: Type },
    ],
    content: { notes, keys },
  })

  picker.addEventListener('change', () => {
    const layout = picker.value as SidebarLayout
    left.controller.update({ layout })
    right.controller.update({ layout })
    keys.textContent = KEYS[layout]
  })

  // The dialog: a checkbox per page, its label wrapped around a thumbnail of the page.
  const dialog = document.createElement('dialog')
  dialog.className = 'remove-pages'
  dialog.setAttribute('aria-labelledby', 'remove-pages-title')
  const form = document.createElement('form')
  form.method = 'dialog'
  const title = document.createElement('h2')
  title.id = 'remove-pages-title'
  title.textContent = 'Remove pages'
  const list = document.createElement('ul')
  const actions = document.createElement('div')
  actions.className = 'remove-pages-actions'
  for (const [value, text] of [
    ['cancel', 'Cancel'],
    ['remove', 'Remove'],
  ]) {
    const b = document.createElement('button')
    b.value = value!
    b.textContent = text!
    actions.append(b)
  }
  form.append(title, list, actions)
  dialog.append(form)
  removeButton.addEventListener('click', () => dialog.showModal())

  // A thumbnail follows the open document, so each page's item is made once and kept.
  const items: HTMLLIElement[] = []
  function item(page: number): HTMLLIElement {
    const li = document.createElement('li')
    const label = document.createElement('label')
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.value = String(page)
    const number = document.createElement('span')
    number.setAttribute('aria-hidden', 'true')
    number.textContent = String(page + 1)
    label.append(box, createThumbnail(viewer, { page, width: 96 }), number)
    li.append(label)
    return li
  }
  const unfollowDocument = viewer.document.subscribe((doc) => {
    const count = doc?.pages.length ?? 0
    for (let page = items.length; page < count; page++) items.push(item(page))
    list.replaceChildren(...items.slice(0, count))
  })

  // The sidebars go either side of the pages.
  const body = document.createElement('div')
  body.className = 'scenario-body'
  const viewport = viewer.element.querySelector('[data-ink-viewport-root]')
  viewport?.replaceWith(body)
  body.append(left.element, ...(viewport ? [viewport] : []), right.element)

  viewer.element.prepend(tools)
  viewer.element.append(status, dialog)

  return {
    open: (next: DocumentSource) => viewer.open(next),
    destroy() {
      unfollowDocument()
      left.controller.destroy()
      right.controller.destroy()
      viewer.destroy()
    },
  }
}
`};export{e as default};