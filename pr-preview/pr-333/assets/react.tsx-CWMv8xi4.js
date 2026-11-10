var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Suggest redactions is a plugin (src/plugin/suggestions.ts). Register it in \`plugins\` and place</span></span>
<span class="line"><span style="color:#A9AFCB"> * its command where you want with InkCommand. Suggest adds the plugin's own records, draws a mark</span></span>
<span class="line"><span style="color:#A9AFCB"> * on each and opens a card when you press one. Accept turns a suggestion into a redaction.</span></span>
<span class="line"><span style="color:#A9AFCB"> * Thumbnails of the pages sit in the left sidebar; ReviewSidebar is the right.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { allTools, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> SidebarOpen } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { Check, Square, SquareDashed } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/icons'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  InkDownloadButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPrintButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkColorMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkCommand,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkHighlightMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkLineStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPanel,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkRecordList,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkRedo,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkRoot,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkShapeMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkSidebar,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkSignatureMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkTextStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkThreadPopover,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkThumbnails,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbarButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbarSeparator,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkUndo,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkViewport,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomSelect,</span></span>
<span class="line"><span style="color:#C9CEE6">  useAnnotations,</span></span>
<span class="line"><span style="color:#C9CEE6">  useCommand,</span></span>
<span class="line"><span style="color:#C9CEE6">  useRecords,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/react'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { useEffect, useRef, useState } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'react'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  acceptedFrom,</span></span>
<span class="line"><span style="color:#C9CEE6">  suggestionsPlugin,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> Suggestion,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../plugin/suggestions'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '../../plugin/suggestions.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { FileUp } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/file-up'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { signatureFonts, signatures } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/signatures'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { Log, ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { InkDocument } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> tools </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> allTools</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> plugins </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> [</span><span style="color:#FFFFFF">suggestionsPlugin</span><span style="color:#C9CEE6">()]</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** Logs each result of the Suggest command. It sits inside InkRoot to reach the command. */</span></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> CommandLog</span><span style="color:#C9CEE6">({ log }</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> { log</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Log</span><span style="color:#C9CEE6"> }) {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> { status } </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useCommand</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'sandbox.suggest'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#FFFFFF">  useEffect</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (status) </span><span style="color:#FFFFFF">log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'command'</span><span style="color:#C9CEE6">, status)</span></span>
<span class="line"><span style="color:#C9CEE6">  }, [status, log])</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#E4FF4A"> null</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/**</span></span>
<span class="line"><span style="color:#A9AFCB"> * The right sidebar. Suggestions lists the plugin's open suggestions as the cards their marks</span></span>
<span class="line"><span style="color:#A9AFCB"> * open. Accepted is your own component on useRecords: Undo accept puts a suggestion back up for</span></span>
<span class="line"><span style="color:#A9AFCB"> * review and removes its redaction, in one undo step. The sidebar opens Suggestions when the</span></span>
<span class="line"><span style="color:#A9AFCB"> * Suggest command finishes. It sits inside InkRoot to reach the records and the command.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> ReviewSidebar</span><span style="color:#C9CEE6">() {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> { records, handle } </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useRecords</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">'sandbox.suggestions'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> { annotations, remove } </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useAnnotations</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> { busy } </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useCommand</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'sandbox.suggest'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // Closed until Suggest has something to show.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> [open, setOpen] </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useState</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">SidebarOpen</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">null</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> wasBusy </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useRef</span><span style="color:#C9CEE6">(busy)</span></span>
<span class="line"><span style="color:#FFFFFF">  useEffect</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (wasBusy.current </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">busy) </span><span style="color:#FFFFFF">setOpen</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'suggestions'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    wasBusy.current </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> busy</span></span>
<span class="line"><span style="color:#C9CEE6">  }, [busy])</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> openCount </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> records.</span><span style="color:#FFFFFF">filter</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> s.status </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'suggested'</span><span style="color:#C9CEE6">).length</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> accepted </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> records.</span><span style="color:#FFFFFF">filter</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> s.status </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'accepted'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> undoAccept</span><span style="color:#C9CEE6">(suggestion</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#C9CEE6">    handle?.</span><span style="color:#FFFFFF">batch</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">      handle.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">(suggestion.id, { status: </span><span style="color:#E4FF4A">'suggested'</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#9DABFF">      for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> a </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> annotations) </span><span style="color:#9DABFF">if</span><span style="color:#C9CEE6"> (</span><span style="color:#FFFFFF">acceptedFrom</span><span style="color:#C9CEE6">(a) </span><span style="color:#9DABFF">===</span><span style="color:#C9CEE6"> suggestion.id) </span><span style="color:#FFFFFF">remove</span><span style="color:#C9CEE6">(a.id)</span></span>
<span class="line"><span style="color:#C9CEE6">    })</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> (</span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6"> side</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"right"</span><span style="color:#C9CEE6"> layout</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"rail"</span><span style="color:#C9CEE6"> open</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{open} onOpenChange</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{setOpen}></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPanel</span></span>
<span class="line"><span style="color:#C9CEE6">        id</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"suggestions"</span></span>
<span class="line"><span style="color:#C9CEE6">        label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Suggestions"</span></span>
<span class="line"><span style="color:#C9CEE6">        icon</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{SquareDashed}</span></span>
<span class="line"><span style="color:#C9CEE6">        badge</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{openCount}</span></span>
<span class="line"><span style="color:#C9CEE6">      ></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkRecordList</span><span style="color:#C9CEE6"> records</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"sandbox.suggestions"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"accepted"</span><span style="color:#C9CEE6"> label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Accepted"</span><span style="color:#C9CEE6"> icon</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{Check}></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"accepted"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          {accepted.length </span><span style="color:#9DABFF">></span><span style="color:#E4FF4A"> 0</span><span style="color:#9DABFF"> ?</span><span style="color:#C9CEE6"> (</span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">ul</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">              {accepted.</span><span style="color:#FFFFFF">map</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> (</span></span>
<span class="line"><span style="color:#C9CEE6">                &#x3C;</span><span style="color:#FFFFFF">li</span><span style="color:#C9CEE6"> key</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{s.id}></span></span>
<span class="line"><span style="color:#C9CEE6">                  &#x3C;</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"accepted-reason"</span><span style="color:#C9CEE6">>{s.reason}&#x3C;/</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">                  &#x3C;</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"accepted-meta"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">                    {s.text}, page {s.page </span><span style="color:#9DABFF">+</span><span style="color:#E4FF4A"> 1</span><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">                  &#x3C;/</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">                  &#x3C;</span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6"> type</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"button"</span><span style="color:#C9CEE6"> onClick</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{() </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> undoAccept</span><span style="color:#C9CEE6">(s)}></span></span>
<span class="line"><span style="color:#C9CEE6">                    Undo accept</span></span>
<span class="line"><span style="color:#C9CEE6">                  &#x3C;/</span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">                &#x3C;/</span><span style="color:#FFFFFF">li</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">              ))}</span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;/</span><span style="color:#FFFFFF">ul</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          ) </span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> (</span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">p</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"accepted-empty"</span><span style="color:#C9CEE6">>Nothing accepted yet.&#x3C;/</span><span style="color:#FFFFFF">p</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          )}</span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> default</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> SuggestRedactions</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">  source,</span></span>
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
<span class="line"><span style="color:#C9CEE6">      assets</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{assets}</span></span>
<span class="line"><span style="color:#C9CEE6">      tools</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{tools}</span></span>
<span class="line"><span style="color:#C9CEE6">      plugins</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{plugins}</span></span>
<span class="line"><span style="color:#C9CEE6">      signatures</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{signatures}</span></span>
<span class="line"><span style="color:#C9CEE6">      signatureFonts</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{signatureFonts}</span></span>
<span class="line"><span style="color:#C9CEE6">      onReady</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{onReady}</span></span>
<span class="line"><span style="color:#C9CEE6">      onActivate</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{(id) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onActivate'</span><span style="color:#C9CEE6">, id)}</span></span>
<span class="line"><span style="color:#C9CEE6">      className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-root"</span></span>
<span class="line"><span style="color:#C9CEE6">    ></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-toolbar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkHighlightMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Tools"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"select-text"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"select"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"redact-area"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"sketch"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"draw"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkShapeMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"freetext"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkSignatureMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"note"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkToolbarSeparator</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Style"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkLineStyleMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkColorMenu</span><span style="color:#C9CEE6"> property</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"border"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkColorMenu</span><span style="color:#C9CEE6"> property</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"fill"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkTextStyleMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkUndo</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkRedo</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-actions"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Suggest"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkCommand</span><span style="color:#C9CEE6"> id</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"sandbox.suggest"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
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
<span class="line"><span style="color:#C9CEE6">        {</span><span style="color:#A9AFCB">/* The Pages panel starts closed, leaving the pages the room. */</span><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6"> side</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"left"</span><span style="color:#C9CEE6"> layout</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"rail"</span><span style="color:#C9CEE6"> defaultOpen</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{</span><span style="color:#E4FF4A">null</span><span style="color:#C9CEE6">}></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"pages"</span><span style="color:#C9CEE6"> label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Pages"</span><span style="color:#C9CEE6"> icon</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{Square}></span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">InkThumbnails</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkViewport</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">ReviewSidebar</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
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
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkThreadPopover</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">CommandLog</span><span style="color:#C9CEE6"> log</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{log} /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkRoot</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Suggest redactions is a plugin (src/plugin/suggestions.ts). Register it in \`plugins\` and place
 * its command where you want with InkCommand. Suggest adds the plugin's own records, draws a mark
 * on each and opens a card when you press one. Accept turns a suggestion into a redaction.
 * Thumbnails of the pages sit in the left sidebar; ReviewSidebar is the right.
 */
import { allTools, type SidebarOpen } from '@inkbar/core/dom'
import { Check, Square, SquareDashed } from '@inkbar/icons'
import {
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
  InkRecordList,
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
  useAnnotations,
  useCommand,
  useRecords,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { useEffect, useRef, useState } from 'react'
import { assets } from 'virtual:inkbar-assets'

import {
  acceptedFrom,
  suggestionsPlugin,
  type Suggestion,
} from '../../plugin/suggestions'
import '../../plugin/suggestions.css'
import { FileUp } from '../../shared/file-up'
import { signatureFonts, signatures } from '../../shared/signatures'

import type { Log, ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

const tools = allTools()
const plugins = [suggestionsPlugin()]

/** Logs each result of the Suggest command. It sits inside InkRoot to reach the command. */
function CommandLog({ log }: { log: Log }) {
  const { status } = useCommand('sandbox.suggest')
  useEffect(() => {
    if (status) log('command', status)
  }, [status, log])
  return null
}

/**
 * The right sidebar. Suggestions lists the plugin's open suggestions as the cards their marks
 * open. Accepted is your own component on useRecords: Undo accept puts a suggestion back up for
 * review and removes its redaction, in one undo step. The sidebar opens Suggestions when the
 * Suggest command finishes. It sits inside InkRoot to reach the records and the command.
 */
function ReviewSidebar() {
  const { records, handle } = useRecords<Suggestion>('sandbox.suggestions')
  const { annotations, remove } = useAnnotations()
  const { busy } = useCommand('sandbox.suggest')

  // Closed until Suggest has something to show.
  const [open, setOpen] = useState<SidebarOpen>(null)
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (wasBusy.current && !busy) setOpen('suggestions')
    wasBusy.current = busy
  }, [busy])

  const openCount = records.filter((s) => s.status === 'suggested').length
  const accepted = records.filter((s) => s.status === 'accepted')

  function undoAccept(suggestion: Suggestion) {
    handle?.batch(() => {
      handle.update(suggestion.id, { status: 'suggested' })
      for (const a of annotations) if (acceptedFrom(a) === suggestion.id) remove(a.id)
    })
  }

  return (
    <InkSidebar side="right" layout="rail" open={open} onOpenChange={setOpen}>
      <InkPanel
        id="suggestions"
        label="Suggestions"
        icon={SquareDashed}
        badge={openCount}
      >
        <InkRecordList records="sandbox.suggestions" />
      </InkPanel>
      <InkPanel id="accepted" label="Accepted" icon={Check}>
        <div className="accepted">
          {accepted.length > 0 ? (
            <ul>
              {accepted.map((s) => (
                <li key={s.id}>
                  <span className="accepted-reason">{s.reason}</span>
                  <span className="accepted-meta">
                    {s.text}, page {s.page + 1}
                  </span>
                  <button type="button" onClick={() => undoAccept(s)}>
                    Undo accept
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="accepted-empty">Nothing accepted yet.</p>
          )}
        </div>
      </InkPanel>
    </InkSidebar>
  )
}

export default function SuggestRedactions({
  source,
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
      assets={assets}
      tools={tools}
      plugins={plugins}
      signatures={signatures}
      signatureFonts={signatureFonts}
      onReady={onReady}
      onActivate={(id) => log('onActivate', id)}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <InkHighlightMenu />
        <div className="scenario-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
          <InkToolButton tool="redact-area" />
          <InkToolButton tool="sketch" />
          <InkToolButton tool="draw" />
          <InkShapeMenu />
          <InkToolButton tool="freetext" />
          <InkSignatureMenu />
          <InkToolButton tool="note" />
        </div>
        <InkToolbarSeparator />
        <div className="scenario-group" role="group" aria-label="Style">
          <InkLineStyleMenu />
          <InkColorMenu property="border" />
          <InkColorMenu property="fill" />
          <InkTextStyleMenu />
        </div>
        <InkUndo />
        <InkRedo />
        <div className="scenario-actions" role="group" aria-label="Suggest">
          <InkCommand id="sandbox.suggest" />
        </div>
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
        {/* The Pages panel starts closed, leaving the pages the room. */}
        <InkSidebar side="left" layout="rail" defaultOpen={null}>
          <InkPanel id="pages" label="Pages" icon={Square}>
            <InkThumbnails />
          </InkPanel>
        </InkSidebar>
        <InkViewport />
        <ReviewSidebar />
      </div>
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
      <InkThreadPopover />
      <CommandLog log={log} />
    </InkRoot>
  )
}
`};export{e as default};