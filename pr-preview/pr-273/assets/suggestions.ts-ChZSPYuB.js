var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Suggest redactions, written as an Inkbar plugin. It uses only Inkbar's public API, and the</span></span>
<span class="line"><span style="color:#A9AFCB"> * same plugin runs on every framework: each registers it in \`plugins\` and places its</span></span>
<span class="line"><span style="color:#A9AFCB"> * Suggest button where it wants.</span></span>
<span class="line"><span style="color:#A9AFCB"> *</span></span>
<span class="line"><span style="color:#A9AFCB"> * A suggestion is the plugin's own record, not an annotation. Suggest adds them; each open one</span></span>
<span class="line"><span style="color:#A9AFCB"> * is drawn as a dashed mark that opens a review card. Accept turns the suggestion into a real</span></span>
<span class="line"><span style="color:#A9AFCB"> * redaction, Dismiss sets it aside, and deleting that redaction puts the suggestion back. Every</span></span>
<span class="line"><span style="color:#A9AFCB"> * one of those is one undo step.</span></span>
<span class="line"><span style="color:#A9AFCB"> *</span></span>
<span class="line"><span style="color:#A9AFCB"> * Suggest searches the open document for a fixed list of made-up values: the customer records</span></span>
<span class="line"><span style="color:#A9AFCB"> * in the sandbox's documents. A real plugin would ask its own service, or receive them from the</span></span>
<span class="line"><span style="color:#A9AFCB"> * host through \`initial\`.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { definePlugin, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> PluginStoreOptions } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { InkDocument, Quad, Rect, RecordBase, SearchHit } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> interface</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#9DABFF"> extends</span><span style="color:#C9CEE6"> RecordBase {</span></span>
<span class="line"><span style="color:#A9AFCB">  /** Page index, from 0. */</span></span>
<span class="line"><span style="color:#C9CEE6">  page</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number</span></span>
<span class="line"><span style="color:#A9AFCB">  /** Where the text is, in PDF user space. */</span></span>
<span class="line"><span style="color:#C9CEE6">  quads</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Quad</span><span style="color:#C9CEE6">[]</span></span>
<span class="line"><span style="color:#A9AFCB">  /** The box around \`quads\`, where the mark goes. */</span></span>
<span class="line"><span style="color:#C9CEE6">  rect</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Rect</span></span>
<span class="line"><span style="color:#A9AFCB">  /** From 0 to 1. */</span></span>
<span class="line"><span style="color:#C9CEE6">  confidence</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number</span></span>
<span class="line"><span style="color:#C9CEE6">  reason</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  explanation</span><span style="color:#9DABFF">?:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#A9AFCB">  /** The text the quads cover. */</span></span>
<span class="line"><span style="color:#C9CEE6">  text</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  status</span><span style="color:#9DABFF">:</span><span style="color:#E4FF4A"> 'suggested'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'accepted'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'dismissed'</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** A kind of personal data, and the values of it that Suggest looks for. */</span></span>
<span class="line"><span style="color:#9DABFF">interface</span><span style="color:#FFFFFF"> Kind</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#A9AFCB">  /** The first suggestion of this kind takes it as its id, the next \`&#x3C;id>-2\`, and so on. */</span></span>
<span class="line"><span style="color:#C9CEE6">  id</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  reason</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  confidence</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number</span></span>
<span class="line"><span style="color:#C9CEE6">  explanation</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  values</span><span style="color:#9DABFF">:</span><span style="color:#9DABFF"> readonly</span><span style="color:#C9CEE6"> string[]</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">// Names and addresses are left out on purpose: the reader redacts those by hand.</span></span>
<span class="line"><span style="color:#A9AFCB">/** Every value is made up, like the documents that hold them. */</span></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> KINDS</span><span style="color:#9DABFF">:</span><span style="color:#9DABFF"> readonly</span><span style="color:#FFFFFF"> Kind</span><span style="color:#C9CEE6">[] </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> [</span></span>
<span class="line"><span style="color:#C9CEE6">  {</span></span>
<span class="line"><span style="color:#C9CEE6">    id: </span><span style="color:#E4FF4A">'ni-number'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    reason: </span><span style="color:#E4FF4A">'National Insurance number'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    confidence: </span><span style="color:#E4FF4A">0.95</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    explanation: </span><span style="color:#E4FF4A">'Two letters, six digits and a final letter.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    values: [</span><span style="color:#E4FF4A">'QQ123456C'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'QQ654321A'</span><span style="color:#C9CEE6">],</span></span>
<span class="line"><span style="color:#C9CEE6">  },</span></span>
<span class="line"><span style="color:#C9CEE6">  {</span></span>
<span class="line"><span style="color:#C9CEE6">    id: </span><span style="color:#E4FF4A">'email'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    reason: </span><span style="color:#E4FF4A">'Email address'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    confidence: </span><span style="color:#E4FF4A">0.85</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    explanation: </span><span style="color:#E4FF4A">'A customer’s email address.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    values: [</span><span style="color:#E4FF4A">'m.okafor@example.com'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'dan.price@example.com'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'aisha.rahman@example.com'</span><span style="color:#C9CEE6">],</span></span>
<span class="line"><span style="color:#C9CEE6">  },</span></span>
<span class="line"><span style="color:#C9CEE6">  {</span></span>
<span class="line"><span style="color:#C9CEE6">    id: </span><span style="color:#E4FF4A">'phone'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    reason: </span><span style="color:#E4FF4A">'Phone number'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    confidence: </span><span style="color:#E4FF4A">0.6</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    explanation: </span><span style="color:#E4FF4A">'Eleven digits starting 07, like a UK mobile number.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    values: [</span><span style="color:#E4FF4A">'07700 900123'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'07700 900456'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'07700 900789'</span><span style="color:#C9CEE6">],</span></span>
<span class="line"><span style="color:#C9CEE6">  },</span></span>
<span class="line"><span style="color:#C9CEE6">]</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> confidenceLevel</span><span style="color:#C9CEE6">(confidence</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number)</span><span style="color:#9DABFF">:</span><span style="color:#E4FF4A"> 'Low'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'Medium'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'High'</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> confidence </span><span style="color:#9DABFF">&#x3C;</span><span style="color:#E4FF4A"> 0.5</span><span style="color:#9DABFF"> ?</span><span style="color:#E4FF4A"> 'Low'</span><span style="color:#9DABFF"> :</span><span style="color:#C9CEE6"> confidence </span><span style="color:#9DABFF">&#x3C;</span><span style="color:#E4FF4A"> 0.8</span><span style="color:#9DABFF"> ?</span><span style="color:#E4FF4A"> 'Medium'</span><span style="color:#9DABFF"> :</span><span style="color:#E4FF4A"> 'High'</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> COLORS </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> { Low: </span><span style="color:#E4FF4A">'#D4A017'</span><span style="color:#C9CEE6">, Medium: </span><span style="color:#E4FF4A">'#E67E22'</span><span style="color:#C9CEE6">, High: </span><span style="color:#E4FF4A">'#C0392B'</span><span style="color:#C9CEE6"> }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** The colour a suggestion is drawn in. */</span></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> confidenceColor</span><span style="color:#C9CEE6">(confidence</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string {</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> COLORS[</span><span style="color:#FFFFFF">confidenceLevel</span><span style="color:#C9CEE6">(confidence)]</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> suggestionCount</span><span style="color:#C9CEE6">(n</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string {</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> n </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 1</span><span style="color:#9DABFF"> ?</span><span style="color:#E4FF4A"> '1 suggestion'</span><span style="color:#9DABFF"> :</span><span style="color:#E4FF4A"> \`\${</span><span style="color:#E4FF4A">n</span><span style="color:#E4FF4A">} suggestions\`</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/**</span></span>
<span class="line"><span style="color:#A9AFCB"> * Every place the document holds one of the values in \`KINDS\`, in reading order. Waits 400 ms</span></span>
<span class="line"><span style="color:#A9AFCB"> * first, like a network round trip, and stops if \`signal\` aborts. A PDF without those values</span></span>
<span class="line"><span style="color:#A9AFCB"> * gets none.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> async</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> findSuggestions</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">  doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  { signal }</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> { signal</span><span style="color:#9DABFF">?:</span><span style="color:#FFFFFF"> AbortSignal</span><span style="color:#C9CEE6"> } </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> {}</span></span>
<span class="line"><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Promise</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">[]> {</span></span>
<span class="line"><span style="color:#9DABFF">  await</span><span style="color:#9DABFF"> new</span><span style="color:#C9CEE6"> Promise((resolve) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> setTimeout</span><span style="color:#C9CEE6">(resolve, </span><span style="color:#E4FF4A">400</span><span style="color:#C9CEE6">))</span></span>
<span class="line"><span style="color:#C9CEE6">  signal?.</span><span style="color:#FFFFFF">throwIfAborted</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#A9AFCB">  // \`doc.search\` is the find bar's search: each hit has its page, text offsets and quads.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> options </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> { matchCase: </span><span style="color:#E4FF4A">true</span><span style="color:#C9CEE6">, </span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">(signal </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> { signal }) }</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> found</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> { kind</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Kind</span><span style="color:#C9CEE6">; hit</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> SearchHit</span><span style="color:#C9CEE6"> }[] </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> []</span></span>
<span class="line"><span style="color:#9DABFF">  for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> kind </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> KINDS)</span></span>
<span class="line"><span style="color:#9DABFF">    for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> value </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> kind.values)</span></span>
<span class="line"><span style="color:#9DABFF">      for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> hit </span><span style="color:#9DABFF">of</span><span style="color:#9DABFF"> await</span><span style="color:#C9CEE6"> doc.</span><span style="color:#FFFFFF">search</span><span style="color:#C9CEE6">(value, options).</span><span style="color:#FFFFFF">all</span><span style="color:#C9CEE6">()) found.</span><span style="color:#FFFFFF">push</span><span style="color:#C9CEE6">({ kind, hit })</span></span>
<span class="line"><span style="color:#A9AFCB">  // Reading order: page by page, then where each hit starts in its page's text.</span></span>
<span class="line"><span style="color:#C9CEE6">  found.</span><span style="color:#FFFFFF">sort</span><span style="color:#C9CEE6">((a, b) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> a.hit.page </span><span style="color:#9DABFF">-</span><span style="color:#C9CEE6"> b.hit.page </span><span style="color:#9DABFF">||</span><span style="color:#C9CEE6"> a.hit.start </span><span style="color:#9DABFF">-</span><span style="color:#C9CEE6"> b.hit.start)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> seen </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> new</span><span style="color:#FFFFFF"> Map</span><span style="color:#C9CEE6">&#x3C;string, number>()</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> found.</span><span style="color:#FFFFFF">map</span><span style="color:#C9CEE6">(({ kind, hit }) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> n </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> (seen.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">(kind.id) </span><span style="color:#9DABFF">??</span><span style="color:#E4FF4A"> 0</span><span style="color:#C9CEE6">) </span><span style="color:#9DABFF">+</span><span style="color:#E4FF4A"> 1</span></span>
<span class="line"><span style="color:#C9CEE6">    seen.</span><span style="color:#FFFFFF">set</span><span style="color:#C9CEE6">(kind.id, n)</span></span>
<span class="line"><span style="color:#9DABFF">    return</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">      id: n </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 1</span><span style="color:#9DABFF"> ?</span><span style="color:#C9CEE6"> kind.id </span><span style="color:#9DABFF">:</span><span style="color:#E4FF4A"> \`\${</span><span style="color:#E4FF4A">kind.</span><span style="color:#C9CEE6">id</span><span style="color:#E4FF4A">}-\${</span><span style="color:#E4FF4A">n</span><span style="color:#E4FF4A">}\`</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">      page: hit.page,</span></span>
<span class="line"><span style="color:#C9CEE6">      quads: hit.quads,</span></span>
<span class="line"><span style="color:#C9CEE6">      rect: hit.rect,</span></span>
<span class="line"><span style="color:#C9CEE6">      confidence: kind.confidence,</span></span>
<span class="line"><span style="color:#C9CEE6">      reason: kind.reason,</span></span>
<span class="line"><span style="color:#C9CEE6">      explanation: kind.explanation,</span></span>
<span class="line"><span style="color:#C9CEE6">      text: hit.text,</span></span>
<span class="line"><span style="color:#C9CEE6">      status: </span><span style="color:#E4FF4A">'suggested'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    }</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> interface</span><span style="color:#FFFFFF"> SuggestionsOptions</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#A9AFCB">  /**</span></span>
<span class="line"><span style="color:#A9AFCB">   * \`suggestions.initial\`: the suggestions a document opens with, the host's saved ones say.</span></span>
<span class="line"><span style="color:#A9AFCB">   * \`suggestions.onChange\`: called after every change, to save them. Inkbar keeps no plugin data.</span></span>
<span class="line"><span style="color:#A9AFCB">   */</span></span>
<span class="line"><span style="color:#C9CEE6">  records</span><span style="color:#9DABFF">?:</span><span style="color:#C9CEE6"> { suggestions</span><span style="color:#9DABFF">?:</span><span style="color:#FFFFFF"> PluginStoreOptions</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">> }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> const</span><span style="color:#C9CEE6"> suggestionsPlugin </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> definePlugin</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">SuggestionsOptions</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">'sandbox'</span><span style="color:#C9CEE6">, (plugin) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> suggestions </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> plugin.</span><span style="color:#FFFFFF">records</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">'suggestions'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // Accept adds a redaction linked to its suggestion. Deleting that redaction puts the</span></span>
<span class="line"><span style="color:#A9AFCB">  // suggestion back up for review, inside the delete's undo step.</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> redaction </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> suggestions.</span><span style="color:#FFFFFF">annotates</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'redact'</span><span style="color:#C9CEE6">, {</span></span>
<span class="line"><span style="color:#FFFFFF">    from</span><span style="color:#C9CEE6">: (s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> ({ page: s.page, quads: s.quads }),</span></span>
<span class="line"><span style="color:#FFFFFF">    onRemoved</span><span style="color:#C9CEE6">: (s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> suggestions.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">(s.id, { status: </span><span style="color:#E4FF4A">'suggested'</span><span style="color:#C9CEE6"> }),</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">  plugin.</span><span style="color:#FFFFFF">command</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">    'suggest'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">    'Suggest redactions'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#9DABFF">    async</span><span style="color:#C9CEE6"> ({ doc, signal }) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">      const</span><span style="color:#C9CEE6"> found </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> await</span><span style="color:#FFFFFF"> findSuggestions</span><span style="color:#C9CEE6">(doc, { signal })</span></span>
<span class="line"><span style="color:#A9AFCB">      // Bound to this run's document: if another file opened meanwhile, this adds nothing.</span></span>
<span class="line"><span style="color:#9DABFF">      return</span><span style="color:#FFFFFF"> suggestionCount</span><span style="color:#C9CEE6">(suggestions.</span><span style="color:#FFFFFF">in</span><span style="color:#C9CEE6">(doc).</span><span style="color:#FFFFFF">addMissing</span><span style="color:#C9CEE6">(found).length)</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">    { errorStatus: </span><span style="color:#E4FF4A">'Could not check this document.'</span><span style="color:#C9CEE6"> }</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">  plugin</span></span>
<span class="line"><span style="color:#C9CEE6">    .</span><span style="color:#FFFFFF">marks</span><span style="color:#C9CEE6">(suggestions, {</span></span>
<span class="line"><span style="color:#FFFFFF">      where</span><span style="color:#C9CEE6">: (s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> s.status </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'suggested'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      rect</span><span style="color:#C9CEE6">: (s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> s.rect,</span></span>
<span class="line"><span style="color:#FFFFFF">      label</span><span style="color:#C9CEE6">: (s) </span><span style="color:#9DABFF">=></span><span style="color:#E4FF4A"> \`Suggested redaction: \${</span><span style="color:#E4FF4A">s.</span><span style="color:#C9CEE6">reason</span><span style="color:#E4FF4A">}\`</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      style</span><span style="color:#C9CEE6">: (s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> ({ borderColor: </span><span style="color:#FFFFFF">confidenceColor</span><span style="color:#C9CEE6">(s.confidence) }),</span></span>
<span class="line"><span style="color:#C9CEE6">      className: </span><span style="color:#E4FF4A">'sandbox-suggestion'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      card</span><span style="color:#C9CEE6">: (s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> ({</span></span>
<span class="line"><span style="color:#C9CEE6">        title: s.reason,</span></span>
<span class="line"><span style="color:#C9CEE6">        label: </span><span style="color:#E4FF4A">'Suggested redaction'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">        meta: </span><span style="color:#E4FF4A">\`\${</span><span style="color:#FFFFFF">confidenceLevel</span><span style="color:#E4FF4A">(s.</span><span style="color:#C9CEE6">confidence</span><span style="color:#E4FF4A">)</span><span style="color:#E4FF4A">} confidence\`</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">        swatch: </span><span style="color:#FFFFFF">confidenceColor</span><span style="color:#C9CEE6">(s.confidence),</span></span>
<span class="line"><span style="color:#9DABFF">        ...</span><span style="color:#C9CEE6">(s.explanation </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> { body: s.explanation }),</span></span>
<span class="line"><span style="color:#C9CEE6">        actions: {</span></span>
<span class="line"><span style="color:#FFFFFF">          Accept</span><span style="color:#C9CEE6">: () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">            suggestions.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">(s.id, { status: </span><span style="color:#E4FF4A">'accepted'</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#C9CEE6">            redaction.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(s)</span></span>
<span class="line"><span style="color:#C9CEE6">          },</span></span>
<span class="line"><span style="color:#FFFFFF">          Dismiss</span><span style="color:#C9CEE6">: () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> suggestions.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">(s.id, { status: </span><span style="color:#E4FF4A">'dismissed'</span><span style="color:#C9CEE6"> }),</span></span>
<span class="line"><span style="color:#C9CEE6">        },</span></span>
<span class="line"><span style="color:#C9CEE6">      }),</span></span>
<span class="line"><span style="color:#C9CEE6">    })</span></span>
<span class="line"><span style="color:#C9CEE6">    .</span><span style="color:#FFFFFF">scrollToFirst</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">})</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Suggest redactions, written as an Inkbar plugin. It uses only Inkbar's public API, and the
 * same plugin runs on every framework: each registers it in \`plugins\` and places its
 * Suggest button where it wants.
 *
 * A suggestion is the plugin's own record, not an annotation. Suggest adds them; each open one
 * is drawn as a dashed mark that opens a review card. Accept turns the suggestion into a real
 * redaction, Dismiss sets it aside, and deleting that redaction puts the suggestion back. Every
 * one of those is one undo step.
 *
 * Suggest searches the open document for a fixed list of made-up values: the customer records
 * in the sandbox's documents. A real plugin would ask its own service, or receive them from the
 * host through \`initial\`.
 */
import { definePlugin, type PluginStoreOptions } from '@inkbar/core/dom'

import type { InkDocument, Quad, Rect, RecordBase, SearchHit } from '@inkbar/core'

export interface Suggestion extends RecordBase {
  /** Page index, from 0. */
  page: number
  /** Where the text is, in PDF user space. */
  quads: Quad[]
  /** The box around \`quads\`, where the mark goes. */
  rect: Rect
  /** From 0 to 1. */
  confidence: number
  reason: string
  explanation?: string
  /** The text the quads cover. */
  text: string
  status: 'suggested' | 'accepted' | 'dismissed'
}

/** A kind of personal data, and the values of it that Suggest looks for. */
interface Kind {
  /** The first suggestion of this kind takes it as its id, the next \`<id>-2\`, and so on. */
  id: string
  reason: string
  confidence: number
  explanation: string
  values: readonly string[]
}

// Names and addresses are left out on purpose: the reader redacts those by hand.
/** Every value is made up, like the documents that hold them. */
const KINDS: readonly Kind[] = [
  {
    id: 'ni-number',
    reason: 'National Insurance number',
    confidence: 0.95,
    explanation: 'Two letters, six digits and a final letter.',
    values: ['QQ123456C', 'QQ654321A'],
  },
  {
    id: 'email',
    reason: 'Email address',
    confidence: 0.85,
    explanation: 'A customer’s email address.',
    values: ['m.okafor@example.com', 'dan.price@example.com', 'aisha.rahman@example.com'],
  },
  {
    id: 'phone',
    reason: 'Phone number',
    confidence: 0.6,
    explanation: 'Eleven digits starting 07, like a UK mobile number.',
    values: ['07700 900123', '07700 900456', '07700 900789'],
  },
]

export function confidenceLevel(confidence: number): 'Low' | 'Medium' | 'High' {
  return confidence < 0.5 ? 'Low' : confidence < 0.8 ? 'Medium' : 'High'
}

const COLORS = { Low: '#D4A017', Medium: '#E67E22', High: '#C0392B' }

/** The colour a suggestion is drawn in. */
export function confidenceColor(confidence: number): string {
  return COLORS[confidenceLevel(confidence)]
}

export function suggestionCount(n: number): string {
  return n === 1 ? '1 suggestion' : \`\${n} suggestions\`
}

/**
 * Every place the document holds one of the values in \`KINDS\`, in reading order. Waits 400 ms
 * first, like a network round trip, and stops if \`signal\` aborts. A PDF without those values
 * gets none.
 */
export async function findSuggestions(
  doc: InkDocument,
  { signal }: { signal?: AbortSignal } = {}
): Promise<Suggestion[]> {
  await new Promise((resolve) => setTimeout(resolve, 400))
  signal?.throwIfAborted()
  // \`doc.search\` is the find bar's search: each hit has its page, text offsets and quads.
  const options = { matchCase: true, ...(signal && { signal }) }
  const found: { kind: Kind; hit: SearchHit }[] = []
  for (const kind of KINDS)
    for (const value of kind.values)
      for (const hit of await doc.search(value, options).all()) found.push({ kind, hit })
  // Reading order: page by page, then where each hit starts in its page's text.
  found.sort((a, b) => a.hit.page - b.hit.page || a.hit.start - b.hit.start)

  const seen = new Map<string, number>()
  return found.map(({ kind, hit }) => {
    const n = (seen.get(kind.id) ?? 0) + 1
    seen.set(kind.id, n)
    return {
      id: n === 1 ? kind.id : \`\${kind.id}-\${n}\`,
      page: hit.page,
      quads: hit.quads,
      rect: hit.rect,
      confidence: kind.confidence,
      reason: kind.reason,
      explanation: kind.explanation,
      text: hit.text,
      status: 'suggested',
    }
  })
}

export interface SuggestionsOptions {
  /**
   * \`suggestions.initial\`: the suggestions a document opens with, the host's saved ones say.
   * \`suggestions.onChange\`: called after every change, to save them. Inkbar keeps no plugin data.
   */
  records?: { suggestions?: PluginStoreOptions<Suggestion> }
}

export const suggestionsPlugin = definePlugin<SuggestionsOptions>('sandbox', (plugin) => {
  const suggestions = plugin.records<Suggestion>('suggestions')

  // Accept adds a redaction linked to its suggestion. Deleting that redaction puts the
  // suggestion back up for review, inside the delete's undo step.
  const redaction = suggestions.annotates('redact', {
    from: (s) => ({ page: s.page, quads: s.quads }),
    onRemoved: (s) => suggestions.update(s.id, { status: 'suggested' }),
  })

  plugin.command(
    'suggest',
    'Suggest redactions',
    async ({ doc, signal }) => {
      const found = await findSuggestions(doc, { signal })
      // Bound to this run's document: if another file opened meanwhile, this adds nothing.
      return suggestionCount(suggestions.in(doc).addMissing(found).length)
    },
    { errorStatus: 'Could not check this document.' }
  )

  plugin
    .marks(suggestions, {
      where: (s) => s.status === 'suggested',
      rect: (s) => s.rect,
      label: (s) => \`Suggested redaction: \${s.reason}\`,
      style: (s) => ({ borderColor: confidenceColor(s.confidence) }),
      className: 'sandbox-suggestion',
      card: (s) => ({
        title: s.reason,
        label: 'Suggested redaction',
        meta: \`\${confidenceLevel(s.confidence)} confidence\`,
        swatch: confidenceColor(s.confidence),
        ...(s.explanation && { body: s.explanation }),
        actions: {
          Accept: () => {
            suggestions.update(s.id, { status: 'accepted' })
            redaction.add(s)
          },
          Dismiss: () => suggestions.update(s.id, { status: 'dismissed' }),
        },
      }),
    })
    .scrollToFirst()
})
`};export{e as default};