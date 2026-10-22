import{Jt as e}from"./signatures-BjgBYsgk.js";import{t}from"./Demo-DkZHzxPt.js";e({page:`plugin`,files:[{path:`src/plugin/suggestions.ts`,source:{html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Suggest redactions, written as an Inkbar plugin. It uses only Inkbar's public API, and the</span></span>
<span class="line"><span style="color:#A9AFCB"> * same plugin runs on every framework page: each registers it in \`plugins\` and places its</span></span>
<span class="line"><span style="color:#A9AFCB"> * Suggest button where it wants.</span></span>
<span class="line"><span style="color:#A9AFCB"> *</span></span>
<span class="line"><span style="color:#A9AFCB"> * A suggestion is the plugin's own record, kept in a plugin store, not an annotation. Suggest</span></span>
<span class="line"><span style="color:#A9AFCB"> * fills the store; a page layer draws each open suggestion as a dashed mark; the mark opens a</span></span>
<span class="line"><span style="color:#A9AFCB"> * review card. Accept turns the suggestion into a real redaction, Dismiss sets it aside. Store</span></span>
<span class="line"><span style="color:#A9AFCB"> * changes join the viewer's undo history, so Undo takes back a whole Suggest run, an accept or</span></span>
<span class="line"><span style="color:#A9AFCB"> * a dismiss.</span></span>
<span class="line"><span style="color:#A9AFCB"> *</span></span>
<span class="line"><span style="color:#A9AFCB"> * The suggestions are static: the four values on page 4 of the sample. A real plugin would ask</span></span>
<span class="line"><span style="color:#A9AFCB"> * its own service, or receive them from the host through \`initial\`.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  writable,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> InkDocument,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> Quad,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> Rect,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> RecordBase,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> RecordChange,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> RecordStore,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { definePlugin, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> InkPlugin, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> PluginContext } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { createSuggestionCard } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> './card.ts'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { drawSuggestions } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> './layer.ts'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> interface</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#9DABFF"> extends</span><span style="color:#C9CEE6"> RecordBase {</span></span>
<span class="line"><span style="color:#A9AFCB">  /** Page index, from 0. */</span></span>
<span class="line"><span style="color:#C9CEE6">  page</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number</span></span>
<span class="line"><span style="color:#A9AFCB">  /** Where the text is, in PDF user space. */</span></span>
<span class="line"><span style="color:#C9CEE6">  quads</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Quad</span><span style="color:#C9CEE6">[]</span></span>
<span class="line"><span style="color:#A9AFCB">  /** The box around \`quads\`, where the layer draws the mark. */</span></span>
<span class="line"><span style="color:#C9CEE6">  rect</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Rect</span></span>
<span class="line"><span style="color:#A9AFCB">  /** From 0 to 1. */</span></span>
<span class="line"><span style="color:#C9CEE6">  confidence</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number</span></span>
<span class="line"><span style="color:#C9CEE6">  reason</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  explanation</span><span style="color:#9DABFF">?:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#A9AFCB">  /** The text the quads cover; Suggest adds a suggestion only when its page's text contains it. */</span></span>
<span class="line"><span style="color:#C9CEE6">  text</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  status</span><span style="color:#9DABFF">:</span><span style="color:#E4FF4A"> 'suggested'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'accepted'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'dismissed'</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** One line of text from \`left\` to \`right\` and \`bottom\` to \`top\`, in PDF points. */</span></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> line</span><span style="color:#C9CEE6">(left</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number, bottom</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number, right</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number, top</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number) {</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    quads: [</span></span>
<span class="line"><span style="color:#C9CEE6">      {</span></span>
<span class="line"><span style="color:#C9CEE6">        p1: { x: left, y: top },</span></span>
<span class="line"><span style="color:#C9CEE6">        p2: { x: right, y: top },</span></span>
<span class="line"><span style="color:#C9CEE6">        p3: { x: left, y: bottom },</span></span>
<span class="line"><span style="color:#C9CEE6">        p4: { x: right, y: bottom },</span></span>
<span class="line"><span style="color:#C9CEE6">      },</span></span>
<span class="line"><span style="color:#C9CEE6">    ],</span></span>
<span class="line"><span style="color:#C9CEE6">    rect: { x: left, y: bottom, width: right </span><span style="color:#9DABFF">-</span><span style="color:#C9CEE6"> left, height: top </span><span style="color:#9DABFF">-</span><span style="color:#C9CEE6"> bottom },</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/**</span></span>
<span class="line"><span style="color:#A9AFCB"> * The sample's customer record on page 4 (index 3), in reading order. The positions come from</span></span>
<span class="line"><span style="color:#A9AFCB"> * the sample's own text layer, rounded to 0.01 pt.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> const</span><span style="color:#C9CEE6"> SAMPLE_SUGGESTIONS</span><span style="color:#9DABFF">:</span><span style="color:#9DABFF"> readonly</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">[] </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> [</span></span>
<span class="line"><span style="color:#C9CEE6">  {</span></span>
<span class="line"><span style="color:#C9CEE6">    id: </span><span style="color:#E4FF4A">'ni-number'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    page: </span><span style="color:#E4FF4A">3</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#9DABFF">    ...</span><span style="color:#FFFFFF">line</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">383</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">246.9</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">443.35</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">258.91</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">    confidence: </span><span style="color:#E4FF4A">0.95</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    reason: </span><span style="color:#E4FF4A">'National Insurance number'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    explanation: </span><span style="color:#E4FF4A">'Two letters, six digits and a final letter.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    text: </span><span style="color:#E4FF4A">'QQ123456C'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    status: </span><span style="color:#E4FF4A">'suggested'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  },</span></span>
<span class="line"><span style="color:#C9CEE6">  {</span></span>
<span class="line"><span style="color:#C9CEE6">    id: </span><span style="color:#E4FF4A">'email'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    page: </span><span style="color:#E4FF4A">3</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#9DABFF">    ...</span><span style="color:#FFFFFF">line</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">383</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">224.9</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">499.65</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">236.91</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">    confidence: </span><span style="color:#E4FF4A">0.85</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    reason: </span><span style="color:#E4FF4A">'Email address'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    explanation: </span><span style="color:#E4FF4A">'The customer’s email address.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    text: </span><span style="color:#E4FF4A">'m.okafor@example.com'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    status: </span><span style="color:#E4FF4A">'suggested'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  },</span></span>
<span class="line"><span style="color:#C9CEE6">  {</span></span>
<span class="line"><span style="color:#C9CEE6">    id: </span><span style="color:#E4FF4A">'phone'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    page: </span><span style="color:#E4FF4A">3</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#9DABFF">    ...</span><span style="color:#FFFFFF">line</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">383</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">202.9</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">451.74</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">214.91</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">    confidence: </span><span style="color:#E4FF4A">0.6</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    reason: </span><span style="color:#E4FF4A">'Phone number'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    explanation: </span><span style="color:#E4FF4A">'Eleven digits starting 07, like a UK mobile number.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    text: </span><span style="color:#E4FF4A">'07700 900123'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    status: </span><span style="color:#E4FF4A">'suggested'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  },</span></span>
<span class="line"><span style="color:#C9CEE6">  {</span></span>
<span class="line"><span style="color:#C9CEE6">    id: </span><span style="color:#E4FF4A">'email-in-note'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    page: </span><span style="color:#E4FF4A">3</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#9DABFF">    ...</span><span style="color:#FFFFFF">line</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">411.32</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">135.95</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">524.99</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">147.68</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">    confidence: </span><span style="color:#E4FF4A">0.85</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    reason: </span><span style="color:#E4FF4A">'Email address'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    explanation: </span><span style="color:#E4FF4A">'The same email address, repeated in the call note.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    text: </span><span style="color:#E4FF4A">'m.okafor@example.com'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    status: </span><span style="color:#E4FF4A">'suggested'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  },</span></span>
<span class="line"><span style="color:#C9CEE6">]</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> suggestionCount</span><span style="color:#C9CEE6">(n</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string {</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> n </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 1</span><span style="color:#9DABFF"> ?</span><span style="color:#E4FF4A"> '1 suggestion'</span><span style="color:#9DABFF"> :</span><span style="color:#E4FF4A"> \`\${</span><span style="color:#E4FF4A">n</span><span style="color:#E4FF4A">} suggestions\`</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/**</span></span>
<span class="line"><span style="color:#A9AFCB"> * The sample suggestions this document holds and the store lacks. Waits 400 ms first, like a</span></span>
<span class="line"><span style="color:#A9AFCB"> * network round trip. On any other PDF the text is not there, so it finds none.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">async</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> findSuggestions</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">  doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  store</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> RecordStore</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Promise</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">[]> {</span></span>
<span class="line"><span style="color:#9DABFF">  await</span><span style="color:#9DABFF"> new</span><span style="color:#C9CEE6"> Promise((resolve) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> setTimeout</span><span style="color:#C9CEE6">(resolve, </span><span style="color:#E4FF4A">400</span><span style="color:#C9CEE6">))</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> pageText </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> new</span><span style="color:#FFFFFF"> Map</span><span style="color:#C9CEE6">&#x3C;number, string>()</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> found</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">[] </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> []</span></span>
<span class="line"><span style="color:#9DABFF">  for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> s </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> SAMPLE_SUGGESTIONS) {</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (store.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">(s.id) </span><span style="color:#9DABFF">||</span><span style="color:#C9CEE6"> s.page </span><span style="color:#9DABFF">>=</span><span style="color:#C9CEE6"> doc.pages.length) </span><span style="color:#9DABFF">continue</span></span>
<span class="line"><span style="color:#9DABFF">    let</span><span style="color:#C9CEE6"> text </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> pageText.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">(s.page)</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (text </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> undefined</span><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#9DABFF">      const</span><span style="color:#C9CEE6"> { items } </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> await</span><span style="color:#C9CEE6"> doc.</span><span style="color:#FFFFFF">text</span><span style="color:#C9CEE6">(s.page)</span></span>
<span class="line"><span style="color:#C9CEE6">      text </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> items.</span><span style="color:#FFFFFF">map</span><span style="color:#C9CEE6">((item) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> item.str).</span><span style="color:#FFFFFF">join</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">' '</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">      pageText.</span><span style="color:#FFFFFF">set</span><span style="color:#C9CEE6">(s.page, text)</span></span>
<span class="line"><span style="color:#C9CEE6">    }</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (text.</span><span style="color:#FFFFFF">includes</span><span style="color:#C9CEE6">(s.text)) found.</span><span style="color:#FFFFFF">push</span><span style="color:#C9CEE6">(s)</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> found</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** What a redaction made by Accept carries, linking it back to its suggestion. */</span></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> suggestionIdOf</span><span style="color:#C9CEE6">(custom</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Record</span><span style="color:#C9CEE6">&#x3C;string, unknown> </span><span style="color:#9DABFF">|</span><span style="color:#C9CEE6"> undefined)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string </span><span style="color:#9DABFF">|</span><span style="color:#C9CEE6"> undefined {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> sandbox </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> custom?.sandbox</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> id </span><span style="color:#9DABFF">=</span></span>
<span class="line"><span style="color:#9DABFF">    typeof</span><span style="color:#C9CEE6"> sandbox </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'object'</span><span style="color:#9DABFF"> &#x26;&#x26;</span><span style="color:#C9CEE6"> sandbox </span><span style="color:#9DABFF">!==</span><span style="color:#E4FF4A"> null</span><span style="color:#9DABFF"> &#x26;&#x26;</span><span style="color:#E4FF4A"> 'suggestionId'</span><span style="color:#9DABFF"> in</span><span style="color:#C9CEE6"> sandbox</span></span>
<span class="line"><span style="color:#9DABFF">      ?</span><span style="color:#C9CEE6"> sandbox.suggestionId</span></span>
<span class="line"><span style="color:#9DABFF">      :</span><span style="color:#E4FF4A"> undefined</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#9DABFF"> typeof</span><span style="color:#C9CEE6"> id </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'string'</span><span style="color:#9DABFF"> ?</span><span style="color:#C9CEE6"> id </span><span style="color:#9DABFF">:</span><span style="color:#E4FF4A"> undefined</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/**</span></span>
<span class="line"><span style="color:#A9AFCB"> * Keeps a suggestion: marks it accepted and adds a redaction over the same text, in the</span></span>
<span class="line"><span style="color:#A9AFCB"> * document's default redaction colour. One batch, so one undo step takes back both.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> acceptSuggestion</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">  ctx</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> PluginContext</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  store</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> RecordStore</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">>,</span></span>
<span class="line"><span style="color:#C9CEE6">  id</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> s </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> store.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">(id)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> doc </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> ctx.document.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">  if</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">!</span><span style="color:#C9CEE6">s </span><span style="color:#9DABFF">||</span><span style="color:#C9CEE6"> s.status </span><span style="color:#9DABFF">!==</span><span style="color:#E4FF4A"> 'suggested'</span><span style="color:#9DABFF"> ||</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">doc) </span><span style="color:#9DABFF">return</span></span>
<span class="line"><span style="color:#C9CEE6">  ctx.history.</span><span style="color:#FFFFFF">batch</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    store.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">(id, { status: </span><span style="color:#E4FF4A">'accepted'</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#C9CEE6">    doc.annotations.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">      type: </span><span style="color:#E4FF4A">'redact'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">      page: s.page,</span></span>
<span class="line"><span style="color:#C9CEE6">      quads: s.quads,</span></span>
<span class="line"><span style="color:#C9CEE6">      color: doc.annotations.defaults.</span><span style="color:#FFFFFF">color</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'redact'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">      custom: { sandbox: { suggestionId: id } },</span></span>
<span class="line"><span style="color:#C9CEE6">    })</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** Sets a suggestion aside. It stays in the store, so Undo can bring it back. */</span></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> dismissSuggestion</span><span style="color:#C9CEE6">(store</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> RecordStore</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">>, id</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">  if</span><span style="color:#C9CEE6"> (store.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">(id)?.status </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'suggested'</span><span style="color:#C9CEE6">) store.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">(id, { status: </span><span style="color:#E4FF4A">'dismissed'</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> interface</span><span style="color:#FFFFFF"> SuggestionsOptions</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#A9AFCB">  /** The suggestions a document opens with: the host's saved ones, say. */</span></span>
<span class="line"><span style="color:#FFFFFF">  initial</span><span style="color:#9DABFF">?:</span><span style="color:#C9CEE6"> (doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#C9CEE6">) </span><span style="color:#9DABFF">=></span><span style="color:#9DABFF"> readonly</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">[]</span></span>
<span class="line"><span style="color:#A9AFCB">  /** Called after every change, to save them. Inkbar keeps no plugin data. */</span></span>
<span class="line"><span style="color:#FFFFFF">  onChange</span><span style="color:#9DABFF">?:</span><span style="color:#C9CEE6"> (list</span><span style="color:#9DABFF">:</span><span style="color:#9DABFF"> readonly</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">[], change</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> RecordChange</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">>) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> void</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> suggestionsPlugin</span><span style="color:#C9CEE6">(opts</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> SuggestionsOptions</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> {})</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkPlugin</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#FFFFFF"> definePlugin</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">    id: </span><span style="color:#E4FF4A">'sandbox'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">    setup</span><span style="color:#C9CEE6">(ctx) {</span></span>
<span class="line"><span style="color:#A9AFCB">      // One store per open document, keyed \`sandbox.suggestions\`; null while none is open.</span></span>
<span class="line"><span style="color:#9DABFF">      const</span><span style="color:#C9CEE6"> suggestions </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> ctx.</span><span style="color:#FFFFFF">store</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">'suggestions'</span><span style="color:#C9CEE6">, {</span></span>
<span class="line"><span style="color:#9DABFF">        ...</span><span style="color:#C9CEE6">(opts.initial </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> { initial: opts.initial }),</span></span>
<span class="line"><span style="color:#9DABFF">        ...</span><span style="color:#C9CEE6">(opts.onChange </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> { onChange: opts.onChange }),</span></span>
<span class="line"><span style="color:#C9CEE6">      })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">      // Suggest redactions. The button shows the status beside it, in a live region.</span></span>
<span class="line"><span style="color:#9DABFF">      const</span><span style="color:#C9CEE6"> status </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> writable</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">''</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">      ctx.commands.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">        id: </span><span style="color:#E4FF4A">'suggest'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">        label: </span><span style="color:#E4FF4A">'Suggest redactions'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">        status,</span></span>
<span class="line"><span style="color:#9DABFF">        async</span><span style="color:#FFFFFF"> run</span><span style="color:#C9CEE6">() {</span></span>
<span class="line"><span style="color:#9DABFF">          const</span><span style="color:#C9CEE6"> doc </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> ctx.document.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">          const</span><span style="color:#C9CEE6"> store </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> suggestions.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">          if</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">!</span><span style="color:#C9CEE6">doc </span><span style="color:#9DABFF">||</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">store) </span><span style="color:#9DABFF">return</span></span>
<span class="line"><span style="color:#C9CEE6">          status.</span><span style="color:#FFFFFF">set</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">''</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">          try</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">            const</span><span style="color:#C9CEE6"> found </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> await</span><span style="color:#FFFFFF"> findSuggestions</span><span style="color:#C9CEE6">(doc, store)</span></span>
<span class="line"><span style="color:#A9AFCB">            // Another file opened meanwhile: this run's results are for a closed document.</span></span>
<span class="line"><span style="color:#9DABFF">            if</span><span style="color:#C9CEE6"> (ctx.document.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">() </span><span style="color:#9DABFF">!==</span><span style="color:#C9CEE6"> doc) </span><span style="color:#9DABFF">return</span></span>
<span class="line"><span style="color:#C9CEE6">            ctx.history.</span><span style="color:#FFFFFF">batch</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">              for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> s </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> found) store.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(s)</span></span>
<span class="line"><span style="color:#C9CEE6">            })</span></span>
<span class="line"><span style="color:#C9CEE6">            status.</span><span style="color:#FFFFFF">set</span><span style="color:#C9CEE6">(</span><span style="color:#FFFFFF">suggestionCount</span><span style="color:#C9CEE6">(found.length))</span></span>
<span class="line"><span style="color:#C9CEE6">          } </span><span style="color:#9DABFF">catch</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">            if</span><span style="color:#C9CEE6"> (ctx.document.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">() </span><span style="color:#9DABFF">===</span><span style="color:#C9CEE6"> doc) status.</span><span style="color:#FFFFFF">set</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Could not check this document.'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">          }</span></span>
<span class="line"><span style="color:#C9CEE6">        },</span></span>
<span class="line"><span style="color:#C9CEE6">      })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">      // Deleting an accepted redaction by hand puts its suggestion back up for review. This</span></span>
<span class="line"><span style="color:#A9AFCB">      // runs inside the delete's undo step, so Undo restores both.</span></span>
<span class="line"><span style="color:#C9CEE6">      ctx.</span><span style="color:#FFFFFF">onAnnotationEdit</span><span style="color:#C9CEE6">((edit) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">        const</span><span style="color:#C9CEE6"> store </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> suggestions.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">        if</span><span style="color:#C9CEE6"> (edit.kind </span><span style="color:#9DABFF">!==</span><span style="color:#E4FF4A"> 'remove'</span><span style="color:#9DABFF"> ||</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">store) </span><span style="color:#9DABFF">return</span></span>
<span class="line"><span style="color:#9DABFF">        for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> a </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> edit.removed) {</span></span>
<span class="line"><span style="color:#9DABFF">          const</span><span style="color:#C9CEE6"> id </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> suggestionIdOf</span><span style="color:#C9CEE6">(a.custom)</span></span>
<span class="line"><span style="color:#9DABFF">          if</span><span style="color:#C9CEE6"> (id </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> store.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">(id)?.status </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'accepted'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">            store.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">(id, { status: </span><span style="color:#E4FF4A">'suggested'</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#C9CEE6">        }</span></span>
<span class="line"><span style="color:#C9CEE6">      })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">      // The review card, opened from a mark.</span></span>
<span class="line"><span style="color:#9DABFF">      const</span><span style="color:#C9CEE6"> card </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createSuggestionCard</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#FFFFFF">        get</span><span style="color:#C9CEE6">: (id) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> suggestions.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()?.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">(id),</span></span>
<span class="line"><span style="color:#FFFFFF">        onAccept</span><span style="color:#C9CEE6">(id) {</span></span>
<span class="line"><span style="color:#9DABFF">          const</span><span style="color:#C9CEE6"> store </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> suggestions.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">          if</span><span style="color:#C9CEE6"> (store) </span><span style="color:#FFFFFF">acceptSuggestion</span><span style="color:#C9CEE6">(ctx, store, id)</span></span>
<span class="line"><span style="color:#C9CEE6">        },</span></span>
<span class="line"><span style="color:#FFFFFF">        onDismiss</span><span style="color:#C9CEE6">(id) {</span></span>
<span class="line"><span style="color:#9DABFF">          const</span><span style="color:#C9CEE6"> store </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> suggestions.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">          if</span><span style="color:#C9CEE6"> (store) </span><span style="color:#FFFFFF">dismissSuggestion</span><span style="color:#C9CEE6">(store, id)</span></span>
<span class="line"><span style="color:#C9CEE6">        },</span></span>
<span class="line"><span style="color:#C9CEE6">      })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">      // Each page draws its open suggestions, and redraws whenever the store changes.</span></span>
<span class="line"><span style="color:#9DABFF">      const</span><span style="color:#C9CEE6"> layer </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> ctx.</span><span style="color:#FFFFFF">layer</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#FFFFFF">        render</span><span style="color:#C9CEE6">(el, page, transform) {</span></span>
<span class="line"><span style="color:#9DABFF">          const</span><span style="color:#C9CEE6"> list </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> suggestions.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()?.list.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">() </span><span style="color:#9DABFF">??</span><span style="color:#C9CEE6"> []</span></span>
<span class="line"><span style="color:#FFFFFF">          drawSuggestions</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">            el,</span></span>
<span class="line"><span style="color:#C9CEE6">            list.</span><span style="color:#FFFFFF">filter</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> s.page </span><span style="color:#9DABFF">===</span><span style="color:#C9CEE6"> page </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> s.status </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'suggested'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">            transform,</span></span>
<span class="line"><span style="color:#C9CEE6">            (id, mark) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> card.</span><span style="color:#FFFFFF">open</span><span style="color:#C9CEE6">(id, mark)</span></span>
<span class="line"><span style="color:#C9CEE6">          )</span></span>
<span class="line"><span style="color:#C9CEE6">        },</span></span>
<span class="line"><span style="color:#C9CEE6">      })</span></span>
<span class="line"><span style="color:#C9CEE6">      ctx.</span><span style="color:#FFFFFF">onDocument</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">        status.</span><span style="color:#FFFFFF">set</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">''</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">        return</span><span style="color:#C9CEE6"> suggestions.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()?.list.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> layer.</span><span style="color:#FFFFFF">invalidate</span><span style="color:#C9CEE6">())</span></span>
<span class="line"><span style="color:#C9CEE6">      })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">      return</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> card.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Suggest redactions, written as an Inkbar plugin. It uses only Inkbar's public API, and the
 * same plugin runs on every framework page: each registers it in \`plugins\` and places its
 * Suggest button where it wants.
 *
 * A suggestion is the plugin's own record, kept in a plugin store, not an annotation. Suggest
 * fills the store; a page layer draws each open suggestion as a dashed mark; the mark opens a
 * review card. Accept turns the suggestion into a real redaction, Dismiss sets it aside. Store
 * changes join the viewer's undo history, so Undo takes back a whole Suggest run, an accept or
 * a dismiss.
 *
 * The suggestions are static: the four values on page 4 of the sample. A real plugin would ask
 * its own service, or receive them from the host through \`initial\`.
 */
import {
  writable,
  type InkDocument,
  type Quad,
  type Rect,
  type RecordBase,
  type RecordChange,
  type RecordStore,
} from '@inkbar/core'
import { definePlugin, type InkPlugin, type PluginContext } from '@inkbar/core/dom'

import { createSuggestionCard } from './card.ts'
import { drawSuggestions } from './layer.ts'

export interface Suggestion extends RecordBase {
  /** Page index, from 0. */
  page: number
  /** Where the text is, in PDF user space. */
  quads: Quad[]
  /** The box around \`quads\`, where the layer draws the mark. */
  rect: Rect
  /** From 0 to 1. */
  confidence: number
  reason: string
  explanation?: string
  /** The text the quads cover; Suggest adds a suggestion only when its page's text contains it. */
  text: string
  status: 'suggested' | 'accepted' | 'dismissed'
}

/** One line of text from \`left\` to \`right\` and \`bottom\` to \`top\`, in PDF points. */
function line(left: number, bottom: number, right: number, top: number) {
  return {
    quads: [
      {
        p1: { x: left, y: top },
        p2: { x: right, y: top },
        p3: { x: left, y: bottom },
        p4: { x: right, y: bottom },
      },
    ],
    rect: { x: left, y: bottom, width: right - left, height: top - bottom },
  }
}

/**
 * The sample's customer record on page 4 (index 3), in reading order. The positions come from
 * the sample's own text layer, rounded to 0.01 pt.
 */
export const SAMPLE_SUGGESTIONS: readonly Suggestion[] = [
  {
    id: 'ni-number',
    page: 3,
    ...line(383, 246.9, 443.35, 258.91),
    confidence: 0.95,
    reason: 'National Insurance number',
    explanation: 'Two letters, six digits and a final letter.',
    text: 'QQ123456C',
    status: 'suggested',
  },
  {
    id: 'email',
    page: 3,
    ...line(383, 224.9, 499.65, 236.91),
    confidence: 0.85,
    reason: 'Email address',
    explanation: 'The customer’s email address.',
    text: 'm.okafor@example.com',
    status: 'suggested',
  },
  {
    id: 'phone',
    page: 3,
    ...line(383, 202.9, 451.74, 214.91),
    confidence: 0.6,
    reason: 'Phone number',
    explanation: 'Eleven digits starting 07, like a UK mobile number.',
    text: '07700 900123',
    status: 'suggested',
  },
  {
    id: 'email-in-note',
    page: 3,
    ...line(411.32, 135.95, 524.99, 147.68),
    confidence: 0.85,
    reason: 'Email address',
    explanation: 'The same email address, repeated in the call note.',
    text: 'm.okafor@example.com',
    status: 'suggested',
  },
]

export function suggestionCount(n: number): string {
  return n === 1 ? '1 suggestion' : \`\${n} suggestions\`
}

/**
 * The sample suggestions this document holds and the store lacks. Waits 400 ms first, like a
 * network round trip. On any other PDF the text is not there, so it finds none.
 */
async function findSuggestions(
  doc: InkDocument,
  store: RecordStore<Suggestion>
): Promise<Suggestion[]> {
  await new Promise((resolve) => setTimeout(resolve, 400))
  const pageText = new Map<number, string>()
  const found: Suggestion[] = []
  for (const s of SAMPLE_SUGGESTIONS) {
    if (store.get(s.id) || s.page >= doc.pages.length) continue
    let text = pageText.get(s.page)
    if (text === undefined) {
      const { items } = await doc.text(s.page)
      text = items.map((item) => item.str).join(' ')
      pageText.set(s.page, text)
    }
    if (text.includes(s.text)) found.push(s)
  }
  return found
}

/** What a redaction made by Accept carries, linking it back to its suggestion. */
function suggestionIdOf(custom: Record<string, unknown> | undefined): string | undefined {
  const sandbox = custom?.sandbox
  const id =
    typeof sandbox === 'object' && sandbox !== null && 'suggestionId' in sandbox
      ? sandbox.suggestionId
      : undefined
  return typeof id === 'string' ? id : undefined
}

/**
 * Keeps a suggestion: marks it accepted and adds a redaction over the same text, in the
 * document's default redaction colour. One batch, so one undo step takes back both.
 */
export function acceptSuggestion(
  ctx: PluginContext,
  store: RecordStore<Suggestion>,
  id: string
): void {
  const s = store.get(id)
  const doc = ctx.document.get()
  if (!s || s.status !== 'suggested' || !doc) return
  ctx.history.batch(() => {
    store.update(id, { status: 'accepted' })
    doc.annotations.add({
      type: 'redact',
      page: s.page,
      quads: s.quads,
      color: doc.annotations.defaults.color('redact'),
      custom: { sandbox: { suggestionId: id } },
    })
  })
}

/** Sets a suggestion aside. It stays in the store, so Undo can bring it back. */
export function dismissSuggestion(store: RecordStore<Suggestion>, id: string): void {
  if (store.get(id)?.status === 'suggested') store.update(id, { status: 'dismissed' })
}

export interface SuggestionsOptions {
  /** The suggestions a document opens with: the host's saved ones, say. */
  initial?: (doc: InkDocument) => readonly Suggestion[]
  /** Called after every change, to save them. Inkbar keeps no plugin data. */
  onChange?: (list: readonly Suggestion[], change: RecordChange<Suggestion>) => void
}

export function suggestionsPlugin(opts: SuggestionsOptions = {}): InkPlugin {
  return definePlugin({
    id: 'sandbox',
    setup(ctx) {
      // One store per open document, keyed \`sandbox.suggestions\`; null while none is open.
      const suggestions = ctx.store<Suggestion>('suggestions', {
        ...(opts.initial && { initial: opts.initial }),
        ...(opts.onChange && { onChange: opts.onChange }),
      })

      // Suggest redactions. The button shows the status beside it, in a live region.
      const status = writable('')
      ctx.commands.add({
        id: 'suggest',
        label: 'Suggest redactions',
        status,
        async run() {
          const doc = ctx.document.get()
          const store = suggestions.get()
          if (!doc || !store) return
          status.set('')
          try {
            const found = await findSuggestions(doc, store)
            // Another file opened meanwhile: this run's results are for a closed document.
            if (ctx.document.get() !== doc) return
            ctx.history.batch(() => {
              for (const s of found) store.add(s)
            })
            status.set(suggestionCount(found.length))
          } catch {
            if (ctx.document.get() === doc) status.set('Could not check this document.')
          }
        },
      })

      // Deleting an accepted redaction by hand puts its suggestion back up for review. This
      // runs inside the delete's undo step, so Undo restores both.
      ctx.onAnnotationEdit((edit) => {
        const store = suggestions.get()
        if (edit.kind !== 'remove' || !store) return
        for (const a of edit.removed) {
          const id = suggestionIdOf(a.custom)
          if (id && store.get(id)?.status === 'accepted')
            store.update(id, { status: 'suggested' })
        }
      })

      // The review card, opened from a mark.
      const card = createSuggestionCard({
        get: (id) => suggestions.get()?.get(id),
        onAccept(id) {
          const store = suggestions.get()
          if (store) acceptSuggestion(ctx, store, id)
        },
        onDismiss(id) {
          const store = suggestions.get()
          if (store) dismissSuggestion(store, id)
        },
      })

      // Each page draws its open suggestions, and redraws whenever the store changes.
      const layer = ctx.layer({
        render(el, page, transform) {
          const list = suggestions.get()?.list.get() ?? []
          drawSuggestions(
            el,
            list.filter((s) => s.page === page && s.status === 'suggested'),
            transform,
            (id, mark) => card.open(id, mark)
          )
        },
      })
      ctx.onDocument(() => {
        status.set('')
        return suggestions.get()?.list.subscribe(() => layer.invalidate())
      })

      return () => card.destroy()
    },
  })
}
`},note:`<code>definePlugin</code> and its <code>setup</code>, run once per viewer. It keeps the suggestions in a store, adds the Suggest command and draws a layer on each page. A host registers it in <code>plugins</code> and places the button.`},{path:`src/plugin/layer.ts`,source:{html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Draws a page's open suggestions into the plugin's layer: one button per suggestion, over its</span></span>
<span class="line"><span style="color:#A9AFCB"> * text, with a dashed border in its confidence colour. The layer comes after the page's</span></span>
<span class="line"><span style="color:#A9AFCB"> * annotations, so Tab reaches the marks after them. A press on a mark is the plugin's: it opens</span></span>
<span class="line"><span style="color:#A9AFCB"> * the review card and goes no further, so it neither clears the selection nor starts a tool.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { Suggestion } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> './suggestions.ts'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { PageTransform } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> confidenceLevel</span><span style="color:#C9CEE6">(confidence</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number)</span><span style="color:#9DABFF">:</span><span style="color:#E4FF4A"> 'low'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'medium'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'high'</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> confidence </span><span style="color:#9DABFF">&#x3C;</span><span style="color:#E4FF4A"> 0.5</span><span style="color:#9DABFF"> ?</span><span style="color:#E4FF4A"> 'low'</span><span style="color:#9DABFF"> :</span><span style="color:#C9CEE6"> confidence </span><span style="color:#9DABFF">&#x3C;</span><span style="color:#E4FF4A"> 0.8</span><span style="color:#9DABFF"> ?</span><span style="color:#E4FF4A"> 'medium'</span><span style="color:#9DABFF"> :</span><span style="color:#E4FF4A"> 'high'</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> COLORS </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> { low: </span><span style="color:#E4FF4A">'#D4A017'</span><span style="color:#C9CEE6">, medium: </span><span style="color:#E4FF4A">'#E67E22'</span><span style="color:#C9CEE6">, high: </span><span style="color:#E4FF4A">'#C0392B'</span><span style="color:#C9CEE6"> }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** The colour a suggestion is drawn in. */</span></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> confidenceColor</span><span style="color:#C9CEE6">(confidence</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string {</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> COLORS[</span><span style="color:#FFFFFF">confidenceLevel</span><span style="color:#C9CEE6">(confidence)]</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> createMark</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">  s</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">  onOpen</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> (id</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string, mark</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> void</span></span>
<span class="line"><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLButtonElement</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> mark </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'button'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  mark.type </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'button'</span></span>
<span class="line"><span style="color:#C9CEE6">  mark.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'sandbox-suggestion'</span></span>
<span class="line"><span style="color:#C9CEE6">  mark.dataset.suggestion </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> s.id</span></span>
<span class="line"><span style="color:#C9CEE6">  mark.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">\`Suggested redaction: \${</span><span style="color:#E4FF4A">s.</span><span style="color:#C9CEE6">reason</span><span style="color:#E4FF4A">}\`</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  mark.style.borderColor </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> confidenceColor</span><span style="color:#C9CEE6">(s.confidence)</span></span>
<span class="line"><span style="color:#C9CEE6">  mark.</span><span style="color:#FFFFFF">addEventListener</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'pointerdown'</span><span style="color:#C9CEE6">, (e) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> e.</span><span style="color:#FFFFFF">stopPropagation</span><span style="color:#C9CEE6">())</span></span>
<span class="line"><span style="color:#A9AFCB">  // A button's click comes from Enter and Space too.</span></span>
<span class="line"><span style="color:#C9CEE6">  mark.</span><span style="color:#FFFFFF">addEventListener</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'click'</span><span style="color:#C9CEE6">, (e) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    e.</span><span style="color:#FFFFFF">stopPropagation</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#FFFFFF">    onOpen</span><span style="color:#C9CEE6">(s.id, mark)</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> mark</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/**</span></span>
<span class="line"><span style="color:#A9AFCB"> * Makes \`el\`'s marks match \`list\`, in its order, placed through \`transform\`: the only</span></span>
<span class="line"><span style="color:#A9AFCB"> * conversion from PDF user space to CSS pixels the plugin needs. Marks that stay are moved,</span></span>
<span class="line"><span style="color:#A9AFCB"> * not redrawn, so a focused mark keeps focus (and the card stays anchored to it) through a</span></span>
<span class="line"><span style="color:#A9AFCB"> * zoom or another suggestion's change.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> drawSuggestions</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">  el</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  list</span><span style="color:#9DABFF">:</span><span style="color:#9DABFF"> readonly</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">[],</span></span>
<span class="line"><span style="color:#C9CEE6">  transform</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> PageTransform</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">  onOpen</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> (id</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string, mark</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> void</span></span>
<span class="line"><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> kept </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> new</span><span style="color:#FFFFFF"> Map</span><span style="color:#C9CEE6">&#x3C;string, </span><span style="color:#FFFFFF">HTMLElement</span><span style="color:#C9CEE6">>()</span></span>
<span class="line"><span style="color:#9DABFF">  for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> mark </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> [</span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">el.children] </span><span style="color:#9DABFF">as</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">[]) {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> id </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> mark.dataset.suggestion</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (id </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> list.</span><span style="color:#FFFFFF">some</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> s.id </span><span style="color:#9DABFF">===</span><span style="color:#C9CEE6"> id)) kept.</span><span style="color:#FFFFFF">set</span><span style="color:#C9CEE6">(id, mark)</span></span>
<span class="line"><span style="color:#9DABFF">    else</span><span style="color:#C9CEE6"> mark.</span><span style="color:#FFFFFF">remove</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> next </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> el.firstElementChild</span></span>
<span class="line"><span style="color:#9DABFF">  for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> s </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> list) {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> mark </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> kept.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">(s.id) </span><span style="color:#9DABFF">??</span><span style="color:#FFFFFF"> createMark</span><span style="color:#C9CEE6">(s, onOpen)</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> r </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> transform.</span><span style="color:#FFFFFF">toCssRect</span><span style="color:#C9CEE6">(s.rect)</span></span>
<span class="line"><span style="color:#C9CEE6">    mark.style.left </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> \`\${</span><span style="color:#E4FF4A">r.</span><span style="color:#C9CEE6">left</span><span style="color:#E4FF4A">}px\`</span></span>
<span class="line"><span style="color:#C9CEE6">    mark.style.top </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> \`\${</span><span style="color:#E4FF4A">r.</span><span style="color:#C9CEE6">top</span><span style="color:#E4FF4A">}px\`</span></span>
<span class="line"><span style="color:#C9CEE6">    mark.style.width </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> \`\${</span><span style="color:#E4FF4A">r.</span><span style="color:#C9CEE6">width</span><span style="color:#E4FF4A">}px\`</span></span>
<span class="line"><span style="color:#C9CEE6">    mark.style.height </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> \`\${</span><span style="color:#E4FF4A">r.</span><span style="color:#C9CEE6">height</span><span style="color:#E4FF4A">}px\`</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (mark </span><span style="color:#9DABFF">===</span><span style="color:#C9CEE6"> next) next </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> mark.nextElementSibling</span></span>
<span class="line"><span style="color:#9DABFF">    else</span><span style="color:#C9CEE6"> el.</span><span style="color:#FFFFFF">insertBefore</span><span style="color:#C9CEE6">(mark, next)</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Draws a page's open suggestions into the plugin's layer: one button per suggestion, over its
 * text, with a dashed border in its confidence colour. The layer comes after the page's
 * annotations, so Tab reaches the marks after them. A press on a mark is the plugin's: it opens
 * the review card and goes no further, so it neither clears the selection nor starts a tool.
 */
import type { Suggestion } from './suggestions.ts'
import type { PageTransform } from '@inkbar/core/dom'

export function confidenceLevel(confidence: number): 'low' | 'medium' | 'high' {
  return confidence < 0.5 ? 'low' : confidence < 0.8 ? 'medium' : 'high'
}

const COLORS = { low: '#D4A017', medium: '#E67E22', high: '#C0392B' }

/** The colour a suggestion is drawn in. */
export function confidenceColor(confidence: number): string {
  return COLORS[confidenceLevel(confidence)]
}

function createMark(
  s: Suggestion,
  onOpen: (id: string, mark: HTMLElement) => void
): HTMLButtonElement {
  const mark = document.createElement('button')
  mark.type = 'button'
  mark.className = 'sandbox-suggestion'
  mark.dataset.suggestion = s.id
  mark.setAttribute('aria-label', \`Suggested redaction: \${s.reason}\`)
  mark.style.borderColor = confidenceColor(s.confidence)
  mark.addEventListener('pointerdown', (e) => e.stopPropagation())
  // A button's click comes from Enter and Space too.
  mark.addEventListener('click', (e) => {
    e.stopPropagation()
    onOpen(s.id, mark)
  })
  return mark
}

/**
 * Makes \`el\`'s marks match \`list\`, in its order, placed through \`transform\`: the only
 * conversion from PDF user space to CSS pixels the plugin needs. Marks that stay are moved,
 * not redrawn, so a focused mark keeps focus (and the card stays anchored to it) through a
 * zoom or another suggestion's change.
 */
export function drawSuggestions(
  el: HTMLElement,
  list: readonly Suggestion[],
  transform: PageTransform,
  onOpen: (id: string, mark: HTMLElement) => void
): void {
  const kept = new Map<string, HTMLElement>()
  for (const mark of [...el.children] as HTMLElement[]) {
    const id = mark.dataset.suggestion
    if (id && list.some((s) => s.id === id)) kept.set(id, mark)
    else mark.remove()
  }
  let next = el.firstElementChild
  for (const s of list) {
    const mark = kept.get(s.id) ?? createMark(s, onOpen)
    const r = transform.toCssRect(s.rect)
    mark.style.left = \`\${r.left}px\`
    mark.style.top = \`\${r.top}px\`
    mark.style.width = \`\${r.width}px\`
    mark.style.height = \`\${r.height}px\`
    if (mark === next) next = mark.nextElementSibling
    else el.insertBefore(mark, next)
  }
}
`},note:`Draws the open suggestions on a page as dashed buttons. Positions are in PDF points; the transform the layer is handed turns them into pixels.`},{path:`src/plugin/card.ts`,source:{html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * The review card for a suggestion: its reason, confidence and explanation, with Accept and</span></span>
<span class="line"><span style="color:#A9AFCB"> * Dismiss. It is a core popover anchored to the mark that opened it, so it follows the mark</span></span>
<span class="line"><span style="color:#A9AFCB"> * as the page scrolls and zooms, and hides if the mark goes. Escape or a press outside closes</span></span>
<span class="line"><span style="color:#A9AFCB"> * it and focus goes back to the mark; after Accept or Dismiss the mark is gone, so focus moves</span></span>
<span class="line"><span style="color:#A9AFCB"> * on to the next one.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { createFocusReturn, createPopover, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> Popover } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { confidenceColor, confidenceLevel } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> './layer.ts'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { Suggestion } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> './suggestions.ts'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> interface</span><span style="color:#FFFFFF"> SuggestionCardOptions</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#A9AFCB">  /** The suggestion as it stands now. */</span></span>
<span class="line"><span style="color:#FFFFFF">  get</span><span style="color:#C9CEE6">(id</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> undefined</span></span>
<span class="line"><span style="color:#FFFFFF">  onAccept</span><span style="color:#C9CEE6">(id</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void</span></span>
<span class="line"><span style="color:#FFFFFF">  onDismiss</span><span style="color:#C9CEE6">(id</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> interface</span><span style="color:#FFFFFF"> SuggestionCard</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#A9AFCB">  /** Shows suggestion \`id\` next to \`mark\`, focusing Accept. */</span></span>
<span class="line"><span style="color:#FFFFFF">  open</span><span style="color:#C9CEE6">(id</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string, mark</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void</span></span>
<span class="line"><span style="color:#FFFFFF">  destroy</span><span style="color:#C9CEE6">()</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> el</span><span style="color:#C9CEE6">(tag</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string, className</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string, </span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">children</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> (</span><span style="color:#FFFFFF">Node</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> string)[])</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> e </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(tag)</span></span>
<span class="line"><span style="color:#C9CEE6">  e.className </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> className</span></span>
<span class="line"><span style="color:#C9CEE6">  e.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">children)</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> e</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> button</span><span style="color:#C9CEE6">(label</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string, </span><span style="color:#FFFFFF">onClick</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> void)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLButtonElement</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> b </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'button'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  b.type </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'button'</span></span>
<span class="line"><span style="color:#C9CEE6">  b.textContent </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> label</span></span>
<span class="line"><span style="color:#C9CEE6">  b.</span><span style="color:#FFFFFF">addEventListener</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'click'</span><span style="color:#C9CEE6">, onClick)</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> b</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> LEVEL_LABELS </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> { low: </span><span style="color:#E4FF4A">'Low'</span><span style="color:#C9CEE6">, medium: </span><span style="color:#E4FF4A">'Medium'</span><span style="color:#C9CEE6">, high: </span><span style="color:#E4FF4A">'High'</span><span style="color:#C9CEE6"> }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** The mark after \`mark\` in the viewer, else the one before it. */</span></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> neighbour</span><span style="color:#C9CEE6">(root</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">, mark</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> null)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> undefined {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> marks </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> [</span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">root.</span><span style="color:#FFFFFF">querySelectorAll</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">HTMLElement</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">'.sandbox-suggestion'</span><span style="color:#C9CEE6">)]</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> i </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> mark </span><span style="color:#9DABFF">?</span><span style="color:#C9CEE6"> marks.</span><span style="color:#FFFFFF">indexOf</span><span style="color:#C9CEE6">(mark) </span><span style="color:#9DABFF">:</span><span style="color:#9DABFF"> -</span><span style="color:#E4FF4A">1</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> i </span><span style="color:#9DABFF">&#x3C;</span><span style="color:#E4FF4A"> 0</span><span style="color:#9DABFF"> ?</span><span style="color:#E4FF4A"> undefined</span><span style="color:#9DABFF"> :</span><span style="color:#C9CEE6"> (marks[i </span><span style="color:#9DABFF">+</span><span style="color:#E4FF4A"> 1</span><span style="color:#C9CEE6">] </span><span style="color:#9DABFF">??</span><span style="color:#C9CEE6"> marks[i </span><span style="color:#9DABFF">-</span><span style="color:#E4FF4A"> 1</span><span style="color:#C9CEE6">])</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> createSuggestionCard</span><span style="color:#C9CEE6">(opts</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> SuggestionCardOptions</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> SuggestionCard</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#A9AFCB">  /** Made on first open, in the viewer the first mark is in. */</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> popover</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Popover</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> null </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> null</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> root</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> null </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> null</span></span>
<span class="line"><span style="color:#A9AFCB">  /** The suggestion on show. */</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> shown</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string </span><span style="color:#9DABFF">|</span><span style="color:#C9CEE6"> null </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> null</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> close</span><span style="color:#C9CEE6">()</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#C9CEE6">    shown </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> null</span></span>
<span class="line"><span style="color:#C9CEE6">    popover?.</span><span style="color:#FFFFFF">hide</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  /** Accept or Dismiss: the mark goes, so focus moves to the next one before the card hides. */</span></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> act</span><span style="color:#C9CEE6">(</span><span style="color:#FFFFFF">fn</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> (id</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> void)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">!</span><span style="color:#C9CEE6">shown </span><span style="color:#9DABFF">||</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">popover </span><span style="color:#9DABFF">||</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">root) </span><span style="color:#9DABFF">return</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> next </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> neighbour</span><span style="color:#C9CEE6">(root, popover.anchor)</span></span>
<span class="line"><span style="color:#FFFFFF">    fn</span><span style="color:#C9CEE6">(shown)</span></span>
<span class="line"><span style="color:#C9CEE6">    next?.</span><span style="color:#FFFFFF">focus</span><span style="color:#C9CEE6">({ preventScroll: </span><span style="color:#E4FF4A">true</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#FFFFFF">    close</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> render</span><span style="color:#C9CEE6">(s</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> swatch </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> el</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'span'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'sandbox-suggestion-swatch'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    swatch.style.background </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> confidenceColor</span><span style="color:#C9CEE6">(s.confidence)</span></span>
<span class="line"><span style="color:#C9CEE6">    popover</span><span style="color:#9DABFF">!</span><span style="color:#C9CEE6">.panel.</span><span style="color:#FFFFFF">replaceChildren</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">      el</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">        'p'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">        'sandbox-suggestion-reason'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">        el</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'strong'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">''</span><span style="color:#C9CEE6">, s.reason),</span></span>
<span class="line"><span style="color:#FFFFFF">        el</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">          'span'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">          'sandbox-suggestion-confidence'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">          swatch,</span></span>
<span class="line"><span style="color:#E4FF4A">          \`\${</span><span style="color:#E4FF4A">LEVEL_LABELS[</span><span style="color:#FFFFFF">confidenceLevel</span><span style="color:#E4FF4A">(s.</span><span style="color:#C9CEE6">confidence</span><span style="color:#E4FF4A">)]</span><span style="color:#E4FF4A">} confidence\`</span></span>
<span class="line"><span style="color:#C9CEE6">        )</span></span>
<span class="line"><span style="color:#C9CEE6">      ),</span></span>
<span class="line"><span style="color:#9DABFF">      ...</span><span style="color:#C9CEE6">(s.explanation</span></span>
<span class="line"><span style="color:#9DABFF">        ?</span><span style="color:#C9CEE6"> [</span><span style="color:#FFFFFF">el</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'p'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'sandbox-suggestion-explanation'</span><span style="color:#C9CEE6">, s.explanation)]</span></span>
<span class="line"><span style="color:#9DABFF">        :</span><span style="color:#C9CEE6"> []),</span></span>
<span class="line"><span style="color:#FFFFFF">      el</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">        'div'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">        'sandbox-suggestion-actions'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">        button</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Accept'</span><span style="color:#C9CEE6">, () </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> act</span><span style="color:#C9CEE6">((id) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> opts.</span><span style="color:#FFFFFF">onAccept</span><span style="color:#C9CEE6">(id))),</span></span>
<span class="line"><span style="color:#FFFFFF">        button</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Dismiss'</span><span style="color:#C9CEE6">, () </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> act</span><span style="color:#C9CEE6">((id) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> opts.</span><span style="color:#FFFFFF">onDismiss</span><span style="color:#C9CEE6">(id)))</span></span>
<span class="line"><span style="color:#C9CEE6">      )</span></span>
<span class="line"><span style="color:#C9CEE6">    )</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">    open</span><span style="color:#C9CEE6">(id, mark) {</span></span>
<span class="line"><span style="color:#9DABFF">      const</span><span style="color:#C9CEE6"> s </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> opts.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">(id)</span></span>
<span class="line"><span style="color:#9DABFF">      const</span><span style="color:#C9CEE6"> viewer </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> mark.</span><span style="color:#FFFFFF">closest</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">HTMLElement</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">'[data-ink-root]'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">      if</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">!</span><span style="color:#C9CEE6">s </span><span style="color:#9DABFF">||</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">viewer) </span><span style="color:#9DABFF">return</span></span>
<span class="line"><span style="color:#9DABFF">      if</span><span style="color:#C9CEE6"> (viewer </span><span style="color:#9DABFF">!==</span><span style="color:#C9CEE6"> root) {</span></span>
<span class="line"><span style="color:#C9CEE6">        popover?.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">        root </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer</span></span>
<span class="line"><span style="color:#9DABFF">        const</span><span style="color:#C9CEE6"> focusReturn </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createFocusReturn</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#FFFFFF">          root</span><span style="color:#C9CEE6">: () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> viewer,</span></span>
<span class="line"><span style="color:#FFFFFF">          activated</span><span style="color:#C9CEE6">: () </span><span style="color:#9DABFF">=></span><span style="color:#E4FF4A"> null</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">        })</span></span>
<span class="line"><span style="color:#C9CEE6">        popover </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createPopover</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">          root: viewer,</span></span>
<span class="line"><span style="color:#C9CEE6">          attrs: {</span></span>
<span class="line"><span style="color:#C9CEE6">            class: </span><span style="color:#E4FF4A">'sandbox-suggestion-card'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">            'aria-label'</span><span style="color:#C9CEE6">: </span><span style="color:#E4FF4A">'Suggested redaction'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">          },</span></span>
<span class="line"><span style="color:#C9CEE6">          focusReturn,</span></span>
<span class="line"><span style="color:#C9CEE6">          onDismiss: close,</span></span>
<span class="line"><span style="color:#C9CEE6">        })</span></span>
<span class="line"><span style="color:#C9CEE6">      }</span></span>
<span class="line"><span style="color:#C9CEE6">      shown </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> id</span></span>
<span class="line"><span style="color:#FFFFFF">      render</span><span style="color:#C9CEE6">(s)</span></span>
<span class="line"><span style="color:#C9CEE6">      popover</span><span style="color:#9DABFF">!</span><span style="color:#C9CEE6">.</span><span style="color:#FFFFFF">showAt</span><span style="color:#C9CEE6">(mark)</span></span>
<span class="line"><span style="color:#C9CEE6">      popover</span><span style="color:#9DABFF">!</span><span style="color:#C9CEE6">.panel.</span><span style="color:#FFFFFF">querySelector</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'button'</span><span style="color:#C9CEE6">)?.</span><span style="color:#FFFFFF">focus</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#FFFFFF">    destroy</span><span style="color:#C9CEE6">() {</span></span>
<span class="line"><span style="color:#C9CEE6">      popover?.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      popover </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> null</span></span>
<span class="line"><span style="color:#C9CEE6">      root </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> null</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * The review card for a suggestion: its reason, confidence and explanation, with Accept and
 * Dismiss. It is a core popover anchored to the mark that opened it, so it follows the mark
 * as the page scrolls and zooms, and hides if the mark goes. Escape or a press outside closes
 * it and focus goes back to the mark; after Accept or Dismiss the mark is gone, so focus moves
 * on to the next one.
 */
import { createFocusReturn, createPopover, type Popover } from '@inkbar/core/dom'

import { confidenceColor, confidenceLevel } from './layer.ts'

import type { Suggestion } from './suggestions.ts'

export interface SuggestionCardOptions {
  /** The suggestion as it stands now. */
  get(id: string): Suggestion | undefined
  onAccept(id: string): void
  onDismiss(id: string): void
}

export interface SuggestionCard {
  /** Shows suggestion \`id\` next to \`mark\`, focusing Accept. */
  open(id: string, mark: HTMLElement): void
  destroy(): void
}

function el(tag: string, className: string, ...children: (Node | string)[]): HTMLElement {
  const e = document.createElement(tag)
  e.className = className
  e.append(...children)
  return e
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.addEventListener('click', onClick)
  return b
}

const LEVEL_LABELS = { low: 'Low', medium: 'Medium', high: 'High' }

/** The mark after \`mark\` in the viewer, else the one before it. */
function neighbour(root: HTMLElement, mark: HTMLElement | null): HTMLElement | undefined {
  const marks = [...root.querySelectorAll<HTMLElement>('.sandbox-suggestion')]
  const i = mark ? marks.indexOf(mark) : -1
  return i < 0 ? undefined : (marks[i + 1] ?? marks[i - 1])
}

export function createSuggestionCard(opts: SuggestionCardOptions): SuggestionCard {
  /** Made on first open, in the viewer the first mark is in. */
  let popover: Popover | null = null
  let root: HTMLElement | null = null
  /** The suggestion on show. */
  let shown: string | null = null

  function close(): void {
    shown = null
    popover?.hide()
  }

  /** Accept or Dismiss: the mark goes, so focus moves to the next one before the card hides. */
  function act(fn: (id: string) => void): void {
    if (!shown || !popover || !root) return
    const next = neighbour(root, popover.anchor)
    fn(shown)
    next?.focus({ preventScroll: true })
    close()
  }

  function render(s: Suggestion): void {
    const swatch = el('span', 'sandbox-suggestion-swatch')
    swatch.style.background = confidenceColor(s.confidence)
    popover!.panel.replaceChildren(
      el(
        'p',
        'sandbox-suggestion-reason',
        el('strong', '', s.reason),
        el(
          'span',
          'sandbox-suggestion-confidence',
          swatch,
          \`\${LEVEL_LABELS[confidenceLevel(s.confidence)]} confidence\`
        )
      ),
      ...(s.explanation
        ? [el('p', 'sandbox-suggestion-explanation', s.explanation)]
        : []),
      el(
        'div',
        'sandbox-suggestion-actions',
        button('Accept', () => act((id) => opts.onAccept(id))),
        button('Dismiss', () => act((id) => opts.onDismiss(id)))
      )
    )
  }

  return {
    open(id, mark) {
      const s = opts.get(id)
      const viewer = mark.closest<HTMLElement>('[data-ink-root]')
      if (!s || !viewer) return
      if (viewer !== root) {
        popover?.destroy()
        root = viewer
        const focusReturn = createFocusReturn({
          root: () => viewer,
          activated: () => null,
        })
        popover = createPopover({
          root: viewer,
          attrs: {
            class: 'sandbox-suggestion-card',
            'aria-label': 'Suggested redaction',
          },
          focusReturn,
          onDismiss: close,
        })
      }
      shown = id
      render(s)
      popover!.showAt(mark)
      popover!.panel.querySelector('button')?.focus()
    },
    destroy() {
      popover?.destroy()
      popover = null
      root = null
    },
  }
}
`},note:`The review card, built on core’s popover. Accept adds a redaction, Dismiss sets the suggestion aside, and Undo takes back either.`},{path:`src/plugin/suggestions.css`,source:{html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/* The suggestions plugin: dashed marks in the page layer, and the review card. */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * A mark sits just outside its text. The layer itself lets presses through to the page; the</span></span>
<span class="line"><span style="color:#A9AFCB"> * mark takes them back, whatever the theme does.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion {</span></span>
<span class="line"><span style="color:#C9CEE6">  position: absolute;</span></span>
<span class="line"><span style="color:#C9CEE6">  box-sizing: content-box;</span></span>
<span class="line"><span style="color:#C9CEE6">  margin: </span><span style="color:#E4FF4A">-3</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  padding: </span><span style="color:#E4FF4A">1</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  border: </span><span style="color:#E4FF4A">2</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6"> dashed;</span></span>
<span class="line"><span style="color:#C9CEE6">  border-radius: </span><span style="color:#E4FF4A">3</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  background: transparent;</span></span>
<span class="line"><span style="color:#C9CEE6">  cursor: pointer;</span></span>
<span class="line"><span style="color:#C9CEE6">  pointer-events: auto;</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion:hover {</span></span>
<span class="line"><span style="color:#C9CEE6">  background: rgb(</span><span style="color:#E4FF4A">0</span><span style="color:#E4FF4A"> 0</span><span style="color:#E4FF4A"> 0</span><span style="color:#C9CEE6"> / </span><span style="color:#E4FF4A">0.06</span><span style="color:#C9CEE6">);</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion:focus-visible {</span></span>
<span class="line"><span style="color:#C9CEE6">  outline: </span><span style="color:#E4FF4A">2</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6"> solid var(--ink-ring);</span></span>
<span class="line"><span style="color:#C9CEE6">  outline-offset: </span><span style="color:#E4FF4A">2</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/* The card is a core popover (data-ink-popover), so the theme gives it its tokens. */</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion-card {</span></span>
<span class="line"><span style="color:#C9CEE6">  z-index: </span><span style="color:#E4FF4A">50</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  width: </span><span style="color:#E4FF4A">20</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  max-width: calc(</span><span style="color:#E4FF4A">100</span><span style="color:#9DABFF">vw</span><span style="color:#9DABFF"> -</span><span style="color:#E4FF4A"> 1</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">);</span></span>
<span class="line"><span style="color:#C9CEE6">  padding: </span><span style="color:#E4FF4A">0.75</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  border: </span><span style="color:#E4FF4A">1</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6"> solid var(--ink-border);</span></span>
<span class="line"><span style="color:#C9CEE6">  border-radius: var(--ink-radius);</span></span>
<span class="line"><span style="color:#C9CEE6">  background: var(--ink-surface);</span></span>
<span class="line"><span style="color:#C9CEE6">  color: var(--ink-fg);</span></span>
<span class="line"><span style="color:#C9CEE6">  box-shadow: </span><span style="color:#E4FF4A">0</span><span style="color:#E4FF4A"> 8</span><span style="color:#9DABFF">px</span><span style="color:#E4FF4A"> 24</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6"> rgb(</span><span style="color:#E4FF4A">0</span><span style="color:#E4FF4A"> 0</span><span style="color:#E4FF4A"> 0</span><span style="color:#C9CEE6"> / </span><span style="color:#E4FF4A">0.15</span><span style="color:#C9CEE6">);</span></span>
<span class="line"><span style="color:#C9CEE6">  font-size: </span><span style="color:#E4FF4A">0.875</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion-card[hidden] {</span></span>
<span class="line"><span style="color:#C9CEE6">  display: none;</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion-reason,</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion-explanation {</span></span>
<span class="line"><span style="color:#C9CEE6">  margin: </span><span style="color:#E4FF4A">0</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion-explanation {</span></span>
<span class="line"><span style="color:#C9CEE6">  margin-top: </span><span style="color:#E4FF4A">0.25</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  color: var(--ink-muted-fg);</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#A9AFCB">/* The label keeps the body colour for contrast; the confidence colour is the swatch. */</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion-confidence {</span></span>
<span class="line"><span style="color:#C9CEE6">  display: inline-flex;</span></span>
<span class="line"><span style="color:#C9CEE6">  align-items: center;</span></span>
<span class="line"><span style="color:#C9CEE6">  gap: </span><span style="color:#E4FF4A">0.375</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  margin-left: </span><span style="color:#E4FF4A">0.5</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  font-size: </span><span style="color:#E4FF4A">0.75</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion-swatch {</span></span>
<span class="line"><span style="color:#C9CEE6">  width: </span><span style="color:#E4FF4A">0.5</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  height: </span><span style="color:#E4FF4A">0.5</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  border-radius: </span><span style="color:#E4FF4A">50</span><span style="color:#9DABFF">%</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion-actions {</span></span>
<span class="line"><span style="color:#C9CEE6">  display: flex;</span></span>
<span class="line"><span style="color:#C9CEE6">  gap: </span><span style="color:#E4FF4A">0.375</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  margin-top: </span><span style="color:#E4FF4A">0.5</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion-actions </span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  padding: </span><span style="color:#E4FF4A">0.375</span><span style="color:#9DABFF">rem</span><span style="color:#E4FF4A"> 0.75</span><span style="color:#9DABFF">rem</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  border: </span><span style="color:#E4FF4A">1</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6"> solid var(--ink-border);</span></span>
<span class="line"><span style="color:#C9CEE6">  border-radius: calc(var(--ink-radius) </span><span style="color:#9DABFF">-</span><span style="color:#E4FF4A"> 2</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6">);</span></span>
<span class="line"><span style="color:#C9CEE6">  background: var(--ink-surface);</span></span>
<span class="line"><span style="color:#C9CEE6">  color: inherit;</span></span>
<span class="line"><span style="color:#C9CEE6">  font: inherit;</span></span>
<span class="line"><span style="color:#C9CEE6">  cursor: pointer;</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion-actions </span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6">:first-child {</span></span>
<span class="line"><span style="color:#C9CEE6">  border-color: var(--ink-accent);</span></span>
<span class="line"><span style="color:#C9CEE6">  background: var(--ink-accent);</span></span>
<span class="line"><span style="color:#C9CEE6">  color: var(--ink-accent-fg);</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion-actions </span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6">:focus-visible {</span></span>
<span class="line"><span style="color:#C9CEE6">  outline: </span><span style="color:#E4FF4A">2</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6"> solid var(--ink-ring);</span></span>
<span class="line"><span style="color:#C9CEE6">  outline-offset: </span><span style="color:#E4FF4A">2</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/* The suggestions plugin: dashed marks in the page layer, and the review card. */

/*
 * A mark sits just outside its text. The layer itself lets presses through to the page; the
 * mark takes them back, whatever the theme does.
 */
.sandbox-suggestion {
  position: absolute;
  box-sizing: content-box;
  margin: -3px;
  padding: 1px;
  border: 2px dashed;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
}
.sandbox-suggestion:hover {
  background: rgb(0 0 0 / 0.06);
}
.sandbox-suggestion:focus-visible {
  outline: 2px solid var(--ink-ring);
  outline-offset: 2px;
}

/* The card is a core popover (data-ink-popover), so the theme gives it its tokens. */
.sandbox-suggestion-card {
  z-index: 50;
  width: 20rem;
  max-width: calc(100vw - 1rem);
  padding: 0.75rem;
  border: 1px solid var(--ink-border);
  border-radius: var(--ink-radius);
  background: var(--ink-surface);
  color: var(--ink-fg);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.15);
  font-size: 0.875rem;
}
.sandbox-suggestion-card[hidden] {
  display: none;
}
.sandbox-suggestion-reason,
.sandbox-suggestion-explanation {
  margin: 0;
}
.sandbox-suggestion-explanation {
  margin-top: 0.25rem;
  color: var(--ink-muted-fg);
}
/* The label keeps the body colour for contrast; the confidence colour is the swatch. */
.sandbox-suggestion-confidence {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin-left: 0.5rem;
  font-size: 0.75rem;
}
.sandbox-suggestion-swatch {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}
.sandbox-suggestion-actions {
  display: flex;
  gap: 0.375rem;
  margin-top: 0.5rem;
}
.sandbox-suggestion-actions button {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--ink-border);
  border-radius: calc(var(--ink-radius) - 2px);
  background: var(--ink-surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sandbox-suggestion-actions button:first-child {
  border-color: var(--ink-accent);
  background: var(--ink-accent);
  color: var(--ink-accent-fg);
}
.sandbox-suggestion-actions button:focus-visible {
  outline: 2px solid var(--ink-ring);
  outline-offset: 2px;
}
`},note:`The marks and the card, styled with the theme’s tokens.`}],mount:t});