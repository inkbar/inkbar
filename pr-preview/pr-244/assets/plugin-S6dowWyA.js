import{on as e}from"./signatures-DuyegOTw.js";import{t}from"./Demo-D3FnZETY.js";e({page:`plugin`,files:[{path:`src/plugin/suggestions.ts`,source:{html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Suggest redactions, written as an Inkbar plugin. It uses only Inkbar's public API, and the</span></span>
<span class="line"><span style="color:#A9AFCB"> * same plugin runs on every framework page: each registers it in \`plugins\` and places its</span></span>
<span class="line"><span style="color:#A9AFCB"> * Suggest button where it wants.</span></span>
<span class="line"><span style="color:#A9AFCB"> *</span></span>
<span class="line"><span style="color:#A9AFCB"> * A suggestion is the plugin's own record, not an annotation. Suggest adds them; each open one</span></span>
<span class="line"><span style="color:#A9AFCB"> * is drawn as a dashed mark that opens a review card. Accept turns the suggestion into a real</span></span>
<span class="line"><span style="color:#A9AFCB"> * redaction, Dismiss sets it aside, and deleting that redaction puts the suggestion back. Every</span></span>
<span class="line"><span style="color:#A9AFCB"> * one of those is one undo step.</span></span>
<span class="line"><span style="color:#A9AFCB"> *</span></span>
<span class="line"><span style="color:#A9AFCB"> * The suggestions are static: the four values on page 4 of the sample. A real plugin would ask</span></span>
<span class="line"><span style="color:#A9AFCB"> * its own service, or receive them from the host through \`initial\`.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  quadsFromRect,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> InkDocument,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> Quad,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> Rect,</span></span>
<span class="line"><span style="color:#9DABFF">  type</span><span style="color:#C9CEE6"> RecordBase,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { definePlugin, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> PluginStoreOptions } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
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
<span class="line"><span style="color:#A9AFCB">  /** The text the quads cover; Suggest adds a suggestion only when its page's text contains it. */</span></span>
<span class="line"><span style="color:#C9CEE6">  text</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  status</span><span style="color:#9DABFF">:</span><span style="color:#E4FF4A"> 'suggested'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'accepted'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'dismissed'</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** One line of text from \`left\` to \`right\` and \`bottom\` to \`top\`, in PDF points. */</span></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> line</span><span style="color:#C9CEE6">(left</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number, bottom</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number, right</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number, top</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number) {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> rect </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> { x: left, y: bottom, width: right </span><span style="color:#9DABFF">-</span><span style="color:#C9CEE6"> left, height: top </span><span style="color:#9DABFF">-</span><span style="color:#C9CEE6"> bottom }</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> { rect, quads: </span><span style="color:#FFFFFF">quadsFromRect</span><span style="color:#C9CEE6">(rect) }</span></span>
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
<span class="line"><span style="color:#A9AFCB"> * The sample suggestions whose text this document holds. Waits 400 ms first, like a network</span></span>
<span class="line"><span style="color:#A9AFCB"> * round trip, and stops there if \`signal\` has aborted. On any other PDF the text is not</span></span>
<span class="line"><span style="color:#A9AFCB"> * there, so it finds none.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> async</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> findSuggestions</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">  doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  { signal }</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> { signal</span><span style="color:#9DABFF">?:</span><span style="color:#FFFFFF"> AbortSignal</span><span style="color:#C9CEE6"> } </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> {}</span></span>
<span class="line"><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Promise</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">[]> {</span></span>
<span class="line"><span style="color:#9DABFF">  await</span><span style="color:#9DABFF"> new</span><span style="color:#C9CEE6"> Promise((resolve) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> setTimeout</span><span style="color:#C9CEE6">(resolve, </span><span style="color:#E4FF4A">400</span><span style="color:#C9CEE6">))</span></span>
<span class="line"><span style="color:#C9CEE6">  signal?.</span><span style="color:#FFFFFF">throwIfAborted</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> found</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">[] </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> []</span></span>
<span class="line"><span style="color:#9DABFF">  for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> s </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> SAMPLE_SUGGESTIONS)</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (s.page </span><span style="color:#9DABFF">&#x3C;</span><span style="color:#C9CEE6"> doc.pages.length </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">await</span><span style="color:#C9CEE6"> doc.</span><span style="color:#FFFFFF">pageText</span><span style="color:#C9CEE6">(s.page)).</span><span style="color:#FFFFFF">includes</span><span style="color:#C9CEE6">(s.text))</span></span>
<span class="line"><span style="color:#C9CEE6">      found.</span><span style="color:#FFFFFF">push</span><span style="color:#C9CEE6">(s)</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> found</span></span>
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
 * same plugin runs on every framework page: each registers it in \`plugins\` and places its
 * Suggest button where it wants.
 *
 * A suggestion is the plugin's own record, not an annotation. Suggest adds them; each open one
 * is drawn as a dashed mark that opens a review card. Accept turns the suggestion into a real
 * redaction, Dismiss sets it aside, and deleting that redaction puts the suggestion back. Every
 * one of those is one undo step.
 *
 * The suggestions are static: the four values on page 4 of the sample. A real plugin would ask
 * its own service, or receive them from the host through \`initial\`.
 */
import {
  quadsFromRect,
  type InkDocument,
  type Quad,
  type Rect,
  type RecordBase,
} from '@inkbar/core'
import { definePlugin, type PluginStoreOptions } from '@inkbar/core/dom'

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
  /** The text the quads cover; Suggest adds a suggestion only when its page's text contains it. */
  text: string
  status: 'suggested' | 'accepted' | 'dismissed'
}

/** One line of text from \`left\` to \`right\` and \`bottom\` to \`top\`, in PDF points. */
function line(left: number, bottom: number, right: number, top: number) {
  const rect = { x: left, y: bottom, width: right - left, height: top - bottom }
  return { rect, quads: quadsFromRect(rect) }
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
 * The sample suggestions whose text this document holds. Waits 400 ms first, like a network
 * round trip, and stops there if \`signal\` has aborted. On any other PDF the text is not
 * there, so it finds none.
 */
export async function findSuggestions(
  doc: InkDocument,
  { signal }: { signal?: AbortSignal } = {}
): Promise<Suggestion[]> {
  await new Promise((resolve) => setTimeout(resolve, 400))
  signal?.throwIfAborted()
  const found: Suggestion[] = []
  for (const s of SAMPLE_SUGGESTIONS)
    if (s.page < doc.pages.length && (await doc.pageText(s.page)).includes(s.text))
      found.push(s)
  return found
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
`},note:`<code>definePlugin</code> and its setup, run once per viewer. It keeps the suggestions as records, adds the Suggest command, draws each open suggestion as a mark with a review card, and links Accept’s redaction back to its suggestion. A host registers it in <code>plugins</code> and places the button.`},{path:`src/plugin/suggestions.css`,source:{html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * The suggestions plugin's marks: a dashed border in the suggestion's confidence colour, which</span></span>
<span class="line"><span style="color:#A9AFCB"> * the plugin sets inline. The review card is core's, styled by the theme.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * A mark sits just outside its text. The layer itself lets presses through to the page; the</span></span>
<span class="line"><span style="color:#A9AFCB"> * mark takes them back, whatever the theme does.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion {</span></span>
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
<span class="line"></span></code></pre>`,code:`/*
 * The suggestions plugin's marks: a dashed border in the suggestion's confidence colour, which
 * the plugin sets inline. The review card is core's, styled by the theme.
 */

/*
 * A mark sits just outside its text. The layer itself lets presses through to the page; the
 * mark takes them back, whatever the theme does.
 */
.sandbox-suggestion {
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
`},note:`The marks’ look. The card is core’s, styled by the theme.`}],mount:t});