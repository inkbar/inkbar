var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Two hundred pages, and no creation tools. The viewer renders only the pages near the</span></span>
<span class="line"><span style="color:#A9AFCB"> * viewport, but search reads every page's text, so the find bar counts every hit and steps to</span></span>
<span class="line"><span style="color:#A9AFCB"> * any of them. Find opens the bar, as does Ctrl+F or Cmd+F. The results sidebar lists every</span></span>
<span class="line"><span style="color:#A9AFCB"> * hit and shows only while there are hits. \`viewer.search\` holds the same state the bar shows,</span></span>
<span class="line"><span style="color:#A9AFCB"> * for a control of your own.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  createFindBar,</span></span>
<span class="line"><span style="color:#C9CEE6">  createDownloadButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPrintButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createSearchButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createSearchResults,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createViewer,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomSelect,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
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
<span class="line"><span style="color:#A9AFCB">  // Log each finished search and each step to a hit, while the find bar is open.</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> last </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.search.state.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> unfollowSearch </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.search.state.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> finished </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> last.scanning </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">s.scanning</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> stepped </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">s.scanning </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> s.current </span><span style="color:#9DABFF">>=</span><span style="color:#E4FF4A"> 0</span><span style="color:#9DABFF"> &#x26;&#x26;</span><span style="color:#C9CEE6"> s.current </span><span style="color:#9DABFF">!==</span><span style="color:#C9CEE6"> last.current</span></span>
<span class="line"><span style="color:#C9CEE6">    last </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> s</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (s.open </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> s.query </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> (finished </span><span style="color:#9DABFF">||</span><span style="color:#C9CEE6"> stepped))</span></span>
<span class="line"><span style="color:#FFFFFF">      log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'search'</span><span style="color:#C9CEE6">, { query: s.query, hits: s.hits.length, current: s.current })</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
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
<span class="line"><span style="color:#FFFFFF">    createSearchButton</span><span style="color:#C9CEE6">(viewer)</span></span>
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
<span class="line"><span style="color:#A9AFCB">  // Every hit, in a panel right of the pages; the find bar is the query field. Your code</span></span>
<span class="line"><span style="color:#A9AFCB">  // decides when it shows: here, while the search has hits. Hidden rather than removed, so</span></span>
<span class="line"><span style="color:#A9AFCB">  // the list keeps its scroll between searches.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> results </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aside'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  results.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'results-aside'</span></span>
<span class="line"><span style="color:#C9CEE6">  results.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-labelledby'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'results-title'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> title </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'h2'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  title.id </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'results-title'</span></span>
<span class="line"><span style="color:#C9CEE6">  title.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'results-aside-title'</span></span>
<span class="line"><span style="color:#C9CEE6">  results.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(title, </span><span style="color:#FFFFFF">createSearchResults</span><span style="color:#C9CEE6">(viewer, { field: </span><span style="color:#E4FF4A">false</span><span style="color:#C9CEE6"> }))</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#FFFFFF"> showResults</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    results.hidden </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.search.state.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">().hits.length </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 0</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#FFFFFF">  showResults</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> unfollowResults </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.search.state.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">(showResults)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> body </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'div'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  body.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'scenario-body'</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> viewport </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.element.</span><span style="color:#FFFFFF">querySelector</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'[data-ink-viewport-root]'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  viewport?.</span><span style="color:#FFFFFF">replaceWith</span><span style="color:#C9CEE6">(body)</span></span>
<span class="line"><span style="color:#C9CEE6">  body.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">(viewport </span><span style="color:#9DABFF">?</span><span style="color:#C9CEE6"> [viewport] </span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> []), results)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.</span><span style="color:#FFFFFF">prepend</span><span style="color:#C9CEE6">(tools)</span></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(status)</span></span>
<span class="line"><span style="color:#A9AFCB">  // The find bar floats over the pages, so it goes in the viewport.</span></span>
<span class="line"><span style="color:#C9CEE6">  viewport?.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span><span style="color:#FFFFFF">createFindBar</span><span style="color:#C9CEE6">(viewer))</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  /** Writes the words this file supplies itself; a change of language writes them again. */</span></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> showLabels</span><span style="color:#C9CEE6">(words</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioLabels</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">    for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> [g, label] </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> groups) g.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, </span><span style="color:#FFFFFF">label</span><span style="color:#C9CEE6">(words))</span></span>
<span class="line"><span style="color:#C9CEE6">    status.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, words.pageAndZoom)</span></span>
<span class="line"><span style="color:#C9CEE6">    openButton.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, words.openPdf)</span></span>
<span class="line"><span style="color:#C9CEE6">    openButton.title </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> words.openPdf</span></span>
<span class="line"><span style="color:#C9CEE6">    openText.data </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> words.open</span></span>
<span class="line"><span style="color:#C9CEE6">    title.textContent </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> words.searchResults</span></span>
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
<span class="line"><span style="color:#FFFFFF">      unfollowSearch</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#FFFFFF">      unfollowResults</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      viewer.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Two hundred pages, and no creation tools. The viewer renders only the pages near the
 * viewport, but search reads every page's text, so the find bar counts every hit and steps to
 * any of them. Find opens the bar, as does Ctrl+F or Cmd+F. The results sidebar lists every
 * hit and shows only while there are hits. \`viewer.search\` holds the same state the bar shows,
 * for a control of your own.
 */
import {
  createFindBar,
  createDownloadButton,
  createIcon,
  createPrintButton,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createSearchButton,
  createSearchResults,
  createToolbar,
  createToolButton,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
} from '@inkbar/core/dom'
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

  // Log each finished search and each step to a hit, while the find bar is open.
  let last = viewer.search.state.get()
  const unfollowSearch = viewer.search.state.subscribe((s) => {
    const finished = last.scanning && !s.scanning
    const stepped = !s.scanning && s.current >= 0 && s.current !== last.current
    last = s
    if (s.open && s.query && (finished || stepped))
      log('search', { query: s.query, hits: s.hits.length, current: s.current })
  })

  const tools = createToolbar({ messages: viewer.messages })
  tools.classList.add('scenario-toolbar')
  tools.append(
    group(
      (w) => w.tools,
      'scenario-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select')
    ),
    createSearchButton(viewer)
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

  // Every hit, in a panel right of the pages; the find bar is the query field. Your code
  // decides when it shows: here, while the search has hits. Hidden rather than removed, so
  // the list keeps its scroll between searches.
  const results = document.createElement('aside')
  results.className = 'results-aside'
  results.setAttribute('aria-labelledby', 'results-title')
  const title = document.createElement('h2')
  title.id = 'results-title'
  title.className = 'results-aside-title'
  results.append(title, createSearchResults(viewer, { field: false }))
  const showResults = () => {
    results.hidden = viewer.search.state.get().hits.length === 0
  }
  showResults()
  const unfollowResults = viewer.search.state.subscribe(showResults)
  const body = document.createElement('div')
  body.className = 'scenario-body'
  const viewport = viewer.element.querySelector('[data-ink-viewport-root]')
  viewport?.replaceWith(body)
  body.append(...(viewport ? [viewport] : []), results)

  viewer.element.prepend(tools)
  viewer.element.append(status)
  // The find bar floats over the pages, so it goes in the viewport.
  viewport?.append(createFindBar(viewer))

  /** Writes the words this file supplies itself; a change of language writes them again. */
  function showLabels(words: ScenarioLabels): void {
    for (const [g, label] of groups) g.setAttribute('aria-label', label(words))
    status.setAttribute('aria-label', words.pageAndZoom)
    openButton.setAttribute('aria-label', words.openPdf)
    openButton.title = words.openPdf
    openText.data = words.open
    title.textContent = words.searchResults
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
      unfollowSearch()
      unfollowResults()
      viewer.destroy()
    },
  }
}
`};export{e as default};