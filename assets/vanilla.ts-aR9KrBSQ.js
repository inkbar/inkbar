var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Your app owns the annotation list, without a framework. Pass \`annotations\` with</span></span>
<span class="line"><span style="color:#A9AFCB"> * \`mode: 'controlled'\` and Inkbar stops keeping its own: every change arrives in \`onChange\`, and</span></span>
<span class="line"><span style="color:#A9AFCB"> * what you push back with \`setControlledValue\` is what the viewer shows. Embedded annotations</span></span>
<span class="line"><span style="color:#A9AFCB"> * stay in the file and never pass through here.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  allTools,</span></span>
<span class="line"><span style="color:#C9CEE6">  createColorMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createHighlightMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createDownloadButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPrintButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createLineStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createShapeMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createSignatureMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createTextStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolbarSeparator,</span></span>
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
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { signatureFonts, storage } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/signatures'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioLabels } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/strings/types'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { Annotation, DocumentSource, InkMessagesInput } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
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
<span class="line"><span style="color:#A9AFCB">  /** The list this app holds; the viewer shows what is pushed back into it. */</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> annotations</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Annotation</span><span style="color:#C9CEE6">[] </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> []</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> viewer </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createViewer</span><span style="color:#C9CEE6">(el, {</span></span>
<span class="line"><span style="color:#C9CEE6">    source,</span></span>
<span class="line"><span style="color:#9DABFF">    ...</span><span style="color:#C9CEE6">(messages </span><span style="color:#9DABFF">?</span><span style="color:#C9CEE6"> { messages } </span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> {}),</span></span>
<span class="line"><span style="color:#9DABFF">    ...</span><span style="color:#C9CEE6">(locale </span><span style="color:#9DABFF">?</span><span style="color:#C9CEE6"> { locale } </span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> {}),</span></span>
<span class="line"><span style="color:#C9CEE6">    assets,</span></span>
<span class="line"><span style="color:#C9CEE6">    tools: </span><span style="color:#FFFFFF">allTools</span><span style="color:#C9CEE6">(),</span></span>
<span class="line"><span style="color:#C9CEE6">    storage,</span></span>
<span class="line"><span style="color:#C9CEE6">    signatureFonts,</span></span>
<span class="line"><span style="color:#C9CEE6">    annotations: {</span></span>
<span class="line"><span style="color:#C9CEE6">      mode: </span><span style="color:#E4FF4A">'controlled'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">      initial: annotations,</span></span>
<span class="line"><span style="color:#FFFFFF">      onChange</span><span style="color:#C9CEE6">: (next) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">        annotations </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> next</span></span>
<span class="line"><span style="color:#FFFFFF">        log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onAnnotationsChange'</span><span style="color:#C9CEE6">, { count: next.length })</span></span>
<span class="line"><span style="color:#C9CEE6">        viewer.document.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()?.annotations.</span><span style="color:#FFFFFF">setControlledValue</span><span style="color:#C9CEE6">(annotations)</span></span>
<span class="line"><span style="color:#C9CEE6">      },</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#FFFFFF">    onReady</span><span style="color:#C9CEE6">: (doc) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">      log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onReady'</span><span style="color:#C9CEE6">, { pages: doc.pages.length })</span></span>
<span class="line"><span style="color:#A9AFCB">      // A reopened document starts from \`initial\`; keep showing what this app holds.</span></span>
<span class="line"><span style="color:#C9CEE6">      doc.annotations.</span><span style="color:#FFFFFF">setControlledValue</span><span style="color:#C9CEE6">(annotations)</span></span>
<span class="line"><span style="color:#FFFFFF">      onDocument</span><span style="color:#C9CEE6">(doc)</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#FFFFFF">    onActivate</span><span style="color:#C9CEE6">: (id) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onActivate'</span><span style="color:#C9CEE6">, id),</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'scenario-root'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // The tool controller changes when a document opens, so follow the current one's tool.</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#FFFFFF"> unfollowTool</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> ()</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void </span><span style="color:#9DABFF">=></span><span style="color:#E4FF4A"> undefined</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> unfollowTools </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.tools.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">((controller) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">    unfollowTool</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    unfollowTool </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> controller</span></span>
<span class="line"><span style="color:#9DABFF">      ?</span><span style="color:#C9CEE6"> controller.active.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">((tool) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'tools.active'</span><span style="color:#C9CEE6">, tool))</span></span>
<span class="line"><span style="color:#9DABFF">      :</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#E4FF4A"> undefined</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> tools </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createToolbar</span><span style="color:#C9CEE6">({ messages: viewer.messages })</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'scenario-toolbar'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">      (w) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> w.tools,</span></span>
<span class="line"><span style="color:#E4FF4A">      'scenario-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createHighlightMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
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
<span class="line"><span style="color:#C9CEE6">      (w) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> w.style,</span></span>
<span class="line"><span style="color:#E4FF4A">      'scenario-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createLineStyleMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createColorMenu</span><span style="color:#C9CEE6">(viewer, { property: </span><span style="color:#E4FF4A">'border'</span><span style="color:#C9CEE6"> }),</span></span>
<span class="line"><span style="color:#FFFFFF">      createColorMenu</span><span style="color:#C9CEE6">(viewer, { property: </span><span style="color:#E4FF4A">'fill'</span><span style="color:#C9CEE6"> }),</span></span>
<span class="line"><span style="color:#FFFFFF">      createTextStyleMenu</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    )</span></span>
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
<span class="line"><span style="color:#FFFFFF">      unfollowTool</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#FFFFFF">      unfollowTools</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      viewer.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Your app owns the annotation list, without a framework. Pass \`annotations\` with
 * \`mode: 'controlled'\` and Inkbar stops keeping its own: every change arrives in \`onChange\`, and
 * what you push back with \`setControlledValue\` is what the viewer shows. Embedded annotations
 * stay in the file and never pass through here.
 */
import {
  allTools,
  createColorMenu,
  createHighlightMenu,
  createDownloadButton,
  createIcon,
  createPrintButton,
  createLineStyleMenu,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createShapeMenu,
  createSignatureMenu,
  createTextStyleMenu,
  createToolbar,
  createToolbarSeparator,
  createToolButton,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
} from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { signatureFonts, storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { ScenarioLabels } from '../../shared/strings/types'
import type { Annotation, DocumentSource, InkMessagesInput } from '@inkbar/core'

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

  /** The list this app holds; the viewer shows what is pushed back into it. */
  let annotations: Annotation[] = []
  const viewer = createViewer(el, {
    source,
    ...(messages ? { messages } : {}),
    ...(locale ? { locale } : {}),
    assets,
    tools: allTools(),
    storage,
    signatureFonts,
    annotations: {
      mode: 'controlled',
      initial: annotations,
      onChange: (next) => {
        annotations = next
        log('onAnnotationsChange', { count: next.length })
        viewer.document.get()?.annotations.setControlledValue(annotations)
      },
    },
    onReady: (doc) => {
      log('onReady', { pages: doc.pages.length })
      // A reopened document starts from \`initial\`; keep showing what this app holds.
      doc.annotations.setControlledValue(annotations)
      onDocument(doc)
    },
    onActivate: (id) => log('onActivate', id),
  })
  viewer.element.classList.add('scenario-root')

  // The tool controller changes when a document opens, so follow the current one's tool.
  let unfollowTool = (): void => undefined
  const unfollowTools = viewer.tools.subscribe((controller) => {
    unfollowTool()
    unfollowTool = controller
      ? controller.active.subscribe((tool) => log('tools.active', tool))
      : () => undefined
  })

  const tools = createToolbar({ messages: viewer.messages })
  tools.classList.add('scenario-toolbar')
  tools.append(
    group(
      (w) => w.tools,
      'scenario-group',
      createHighlightMenu(viewer),
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
      (w) => w.style,
      'scenario-group',
      createLineStyleMenu(viewer),
      createColorMenu(viewer, { property: 'border' }),
      createColorMenu(viewer, { property: 'fill' }),
      createTextStyleMenu(viewer)
    )
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

  viewer.element.prepend(tools)
  viewer.element.append(status)

  /** Writes the words this file supplies itself; a change of language writes them again. */
  function showLabels(words: ScenarioLabels): void {
    for (const [g, label] of groups) g.setAttribute('aria-label', label(words))
    status.setAttribute('aria-label', words.pageAndZoom)
    openButton.setAttribute('aria-label', words.openPdf)
    openButton.title = words.openPdf
    openText.data = words.open
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
      unfollowTool()
      unfollowTools()
      viewer.destroy()
    },
  }
}
`};export{e as default};