import{Qt as e}from"./signatures-MdLAB0dt.js";import{t}from"./Demo-_c1lxq7T.js";e({page:`vanilla`,files:[{path:`src/vanilla/Demo.ts`,source:{html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Inkbar without a framework: createViewer opens the document and renders the viewer and its</span></span>
<span class="line"><span style="color:#A9AFCB"> * popovers. The document keeps its own form values and undo history, so Undo covers field</span></span>
<span class="line"><span style="color:#A9AFCB"> * edits too. The page follows the form's values (\`doc.form.values\`) for the Gloss view and</span></span>
<span class="line"><span style="color:#A9AFCB"> * hears the form's requests (\`onFormAction\`), which the Form panel lists. The toolbars are</span></span>
<span class="line"><span style="color:#A9AFCB"> * built from Inkbar's controls, so each one is yours to keep, move or drop, and each button</span></span>
<span class="line"><span style="color:#A9AFCB"> * takes your own icon in place of the one it shows. Suggest redactions is a plugin</span></span>
<span class="line"><span style="color:#A9AFCB"> * (src/plugin/suggestions.ts): registered in \`plugins\`, with its button placed by</span></span>
<span class="line"><span style="color:#A9AFCB"> * createCommandButton.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  createColorMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createCommandButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createHighlightMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createLineStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createTextStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createRedo,</span></span>
<span class="line"><span style="color:#C9CEE6">  createShapeMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createSignatureMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolbarSeparator,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createUndo,</span></span>
<span class="line"><span style="color:#C9CEE6">  createViewer,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomSelect,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { suggestionsPlugin } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../plugin/suggestions'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '../plugin/suggestions.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { glossFields, logAction, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> LoggedAction } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../shared/form'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { signatureFonts, signatures } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../shared/signatures'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { DocumentSource, FormAction } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
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
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> element</span><span style="color:#C9CEE6">(tag</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string, text </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> ''</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> e </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(tag)</span></span>
<span class="line"><span style="color:#C9CEE6">  e.textContent </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> text</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> e</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** The Form panel: the form's latest actions and its values as Gloss, set as text only. */</span></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> formPanel</span><span style="color:#C9CEE6">() {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> panel </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> element</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'section'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  panel.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'demo-form'</span></span>
<span class="line"><span style="color:#C9CEE6">  panel.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-labelledby'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'demo-form-title'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#A9AFCB">  // It scrolls, so it takes focus for keyboard scrolling.</span></span>
<span class="line"><span style="color:#C9CEE6">  panel.tabIndex </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 0</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> title </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> element</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'h2'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Form'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  title.id </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'demo-form-title'</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> list </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> element</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'ol'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> empty </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> element</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'p'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'None yet. Try the buttons on page 6.'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> gloss </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> element</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'pre'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  panel.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">    title,</span></span>
<span class="line"><span style="color:#FFFFFF">    element</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'p'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      "Inkbar never sends, opens or prints anything. The form's requests come here."</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#FFFFFF">    element</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'h3'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Actions'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">    empty,</span></span>
<span class="line"><span style="color:#FFFFFF">    element</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'h3'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Fields as Gloss'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">    gloss</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> log</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> LoggedAction</span><span style="color:#C9CEE6">[] </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> []</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    element: panel,</span></span>
<span class="line"><span style="color:#FFFFFF">    action</span><span style="color:#C9CEE6">(a</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> FormAction</span><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#C9CEE6">      log </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> logAction</span><span style="color:#C9CEE6">(log, a)</span></span>
<span class="line"><span style="color:#C9CEE6">      list.</span><span style="color:#FFFFFF">replaceChildren</span><span style="color:#C9CEE6">(</span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">log.</span><span style="color:#FFFFFF">map</span><span style="color:#C9CEE6">((entry) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> element</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'li'</span><span style="color:#C9CEE6">, entry.text)))</span></span>
<span class="line"><span style="color:#9DABFF">      if</span><span style="color:#C9CEE6"> (empty.isConnected) empty.</span><span style="color:#FFFFFF">replaceWith</span><span style="color:#C9CEE6">(list)</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#FFFFFF">    gloss</span><span style="color:#C9CEE6">(text</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string) {</span></span>
<span class="line"><span style="color:#C9CEE6">      gloss.textContent </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> text</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> mountDemo</span><span style="color:#C9CEE6">(el</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">, source</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> DocumentSource</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> panel </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> formPanel</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#A9AFCB">  /** Stops following the last document's values. */</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#FFFFFF"> unfollow</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> ()</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void </span><span style="color:#9DABFF">=></span><span style="color:#E4FF4A"> undefined</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> viewer </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createViewer</span><span style="color:#C9CEE6">(el, {</span></span>
<span class="line"><span style="color:#C9CEE6">    source,</span></span>
<span class="line"><span style="color:#C9CEE6">    assets,</span></span>
<span class="line"><span style="color:#C9CEE6">    signatures,</span></span>
<span class="line"><span style="color:#C9CEE6">    signatureFonts,</span></span>
<span class="line"><span style="color:#C9CEE6">    plugins: [</span><span style="color:#FFFFFF">suggestionsPlugin</span><span style="color:#C9CEE6">()],</span></span>
<span class="line"><span style="color:#FFFFFF">    onFormAction</span><span style="color:#C9CEE6">: (a) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> panel.</span><span style="color:#FFFFFF">action</span><span style="color:#C9CEE6">(a),</span></span>
<span class="line"><span style="color:#A9AFCB">    // The Gloss view follows each change to the open document's values.</span></span>
<span class="line"><span style="color:#FFFFFF">    onReady</span><span style="color:#C9CEE6">: (doc) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">      unfollow</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      panel.</span><span style="color:#FFFFFF">gloss</span><span style="color:#C9CEE6">(</span><span style="color:#FFFFFF">glossFields</span><span style="color:#C9CEE6">(doc))</span></span>
<span class="line"><span style="color:#C9CEE6">      unfollow </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> doc.form.values.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> panel.</span><span style="color:#FFFFFF">gloss</span><span style="color:#C9CEE6">(</span><span style="color:#FFFFFF">glossFields</span><span style="color:#C9CEE6">(doc)))</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'demo-root'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // The panel sits beside the viewport, in a row of its own.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> body </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> element</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'div'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  body.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'demo-body'</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> viewport </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.element.</span><span style="color:#FFFFFF">querySelector</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'.ink-viewport-root'</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">!</span></span>
<span class="line"><span style="color:#C9CEE6">  viewport.</span><span style="color:#FFFFFF">replaceWith</span><span style="color:#C9CEE6">(body)</span></span>
<span class="line"><span style="color:#C9CEE6">  body.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(viewport, panel.element)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> tools </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createToolbar</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'demo-toolbar'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    createHighlightMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Tools'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'demo-group'</span><span style="color:#C9CEE6">,</span></span>
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
<span class="line"><span style="color:#E4FF4A">      'demo-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createLineStyleMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createColorMenu</span><span style="color:#C9CEE6">(viewer, { property: </span><span style="color:#E4FF4A">'border'</span><span style="color:#C9CEE6"> }),</span></span>
<span class="line"><span style="color:#FFFFFF">      createColorMenu</span><span style="color:#C9CEE6">(viewer, { property: </span><span style="color:#E4FF4A">'fill'</span><span style="color:#C9CEE6"> }),</span></span>
<span class="line"><span style="color:#FFFFFF">      createTextStyleMenu</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#FFFFFF">    createUndo</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">    createRedo</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Suggest'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'demo-actions'</span><span style="color:#C9CEE6">, </span><span style="color:#FFFFFF">createCommandButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'sandbox.suggest'</span><span style="color:#C9CEE6">))</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> status </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createToolbar</span><span style="color:#C9CEE6">({ label: </span><span style="color:#E4FF4A">'Page and zoom'</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#C9CEE6">  status.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'demo-status-bar'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  status.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Page'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'demo-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createPrevPage</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createPageInput</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createPageCount</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createNextPage</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Zoom'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'demo-group demo-zoom'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createZoomOut</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createZoomSelect</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createZoomIn</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    )</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.</span><span style="color:#FFFFFF">prepend</span><span style="color:#C9CEE6">(tools)</span></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(status)</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">    unfollow</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    viewer.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Inkbar without a framework: createViewer opens the document and renders the viewer and its
 * popovers. The document keeps its own form values and undo history, so Undo covers field
 * edits too. The page follows the form's values (\`doc.form.values\`) for the Gloss view and
 * hears the form's requests (\`onFormAction\`), which the Form panel lists. The toolbars are
 * built from Inkbar's controls, so each one is yours to keep, move or drop, and each button
 * takes your own icon in place of the one it shows. Suggest redactions is a plugin
 * (src/plugin/suggestions.ts): registered in \`plugins\`, with its button placed by
 * createCommandButton.
 */
import {
  createColorMenu,
  createCommandButton,
  createHighlightMenu,
  createLineStyleMenu,
  createTextStyleMenu,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createRedo,
  createShapeMenu,
  createSignatureMenu,
  createToolbar,
  createToolbarSeparator,
  createToolButton,
  createUndo,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
} from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { suggestionsPlugin } from '../plugin/suggestions'
import '../plugin/suggestions.css'
import { glossFields, logAction, type LoggedAction } from '../shared/form'
import { signatureFonts, signatures } from '../shared/signatures'

import type { DocumentSource, FormAction } from '@inkbar/core'

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

function element(tag: string, text = ''): HTMLElement {
  const e = document.createElement(tag)
  e.textContent = text
  return e
}

/** The Form panel: the form's latest actions and its values as Gloss, set as text only. */
function formPanel() {
  const panel = element('section')
  panel.className = 'demo-form'
  panel.setAttribute('aria-labelledby', 'demo-form-title')
  // It scrolls, so it takes focus for keyboard scrolling.
  panel.tabIndex = 0
  const title = element('h2', 'Form')
  title.id = 'demo-form-title'
  const list = element('ol')
  const empty = element('p', 'None yet. Try the buttons on page 6.')
  const gloss = element('pre')
  panel.append(
    title,
    element(
      'p',
      "Inkbar never sends, opens or prints anything. The form's requests come here."
    ),
    element('h3', 'Actions'),
    empty,
    element('h3', 'Fields as Gloss'),
    gloss
  )
  let log: LoggedAction[] = []
  return {
    element: panel,
    action(a: FormAction) {
      log = logAction(log, a)
      list.replaceChildren(...log.map((entry) => element('li', entry.text)))
      if (empty.isConnected) empty.replaceWith(list)
    },
    gloss(text: string) {
      gloss.textContent = text
    },
  }
}

export function mountDemo(el: HTMLElement, source: DocumentSource): () => void {
  const panel = formPanel()
  /** Stops following the last document's values. */
  let unfollow = (): void => undefined
  const viewer = createViewer(el, {
    source,
    assets,
    signatures,
    signatureFonts,
    plugins: [suggestionsPlugin()],
    onFormAction: (a) => panel.action(a),
    // The Gloss view follows each change to the open document's values.
    onReady: (doc) => {
      unfollow()
      panel.gloss(glossFields(doc))
      unfollow = doc.form.values.subscribe(() => panel.gloss(glossFields(doc)))
    },
  })
  viewer.element.classList.add('demo-root')

  // The panel sits beside the viewport, in a row of its own.
  const body = element('div')
  body.className = 'demo-body'
  const viewport = viewer.element.querySelector('.ink-viewport-root')!
  viewport.replaceWith(body)
  body.append(viewport, panel.element)

  const tools = createToolbar()
  tools.classList.add('demo-toolbar')
  tools.append(
    createHighlightMenu(viewer),
    group(
      'Tools',
      'demo-group',
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
      'demo-group',
      createLineStyleMenu(viewer),
      createColorMenu(viewer, { property: 'border' }),
      createColorMenu(viewer, { property: 'fill' }),
      createTextStyleMenu(viewer)
    ),
    createUndo(viewer),
    createRedo(viewer),
    group('Suggest', 'demo-actions', createCommandButton(viewer, 'sandbox.suggest'))
  )

  const status = createToolbar({ label: 'Page and zoom' })
  status.classList.add('demo-status-bar')
  status.append(
    group(
      'Page',
      'demo-group',
      createPrevPage(viewer),
      createPageInput(viewer),
      createPageCount(viewer),
      createNextPage(viewer)
    ),
    group(
      'Zoom',
      'demo-group demo-zoom',
      createZoomOut(viewer),
      createZoomSelect(viewer),
      createZoomIn(viewer)
    )
  )

  viewer.element.prepend(tools)
  viewer.element.append(status)
  return () => {
    unfollow()
    viewer.destroy()
  }
}
`}}],mount:t});