import"./client-DlM7410A.js";var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6"> lang=</span><span style="color:#E4FF4A">"ts"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#A9AFCB">  /*</span></span>
<span class="line"><span style="color:#A9AFCB">   * Every hit, in a panel right of the pages; the find bar is the query field. Your code</span></span>
<span class="line"><span style="color:#A9AFCB">   * decides when it shows: here, while the search has hits. It sits inside InkRoot to reach</span></span>
<span class="line"><span style="color:#A9AFCB">   * search.</span></span>
<span class="line"><span style="color:#A9AFCB">   */</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { InkSearchResults, useSearch } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/svelte'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> search </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useSearch</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> hasResults </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">derived</span><span style="color:#C9CEE6">(search.state.hits.length </span><span style="color:#9DABFF">></span><span style="color:#E4FF4A"> 0</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">&#x3C;!-- Hidden rather than removed, so the list keeps its scroll between searches. --></span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">aside</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"results-aside"</span><span style="color:#C9CEE6"> aria-labelledby=</span><span style="color:#E4FF4A">"results-title"</span><span style="color:#C9CEE6"> hidden={</span><span style="color:#9DABFF">!</span><span style="color:#C9CEE6">hasResults}></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">h2</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"results-title"</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"results-aside-title"</span><span style="color:#C9CEE6">>Search results&#x3C;/</span><span style="color:#FFFFFF">h2</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">InkSearchResults</span><span style="color:#C9CEE6"> field={</span><span style="color:#E4FF4A">false</span><span style="color:#C9CEE6">} /></span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">aside</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span></code></pre>`,code:`<script lang="ts">
  /*
   * Every hit, in a panel right of the pages; the find bar is the query field. Your code
   * decides when it shows: here, while the search has hits. It sits inside InkRoot to reach
   * search.
   */
  import { InkSearchResults, useSearch } from '@inkbar/svelte'

  const search = useSearch()
  const hasResults = $derived(search.state.hits.length > 0)
<\/script>

<!-- Hidden rather than removed, so the list keeps its scroll between searches. -->
<aside class="results-aside" aria-labelledby="results-title" hidden={!hasResults}>
  <h2 id="results-title" class="results-aside-title">Search results</h2>
  <InkSearchResults field={false} />
</aside>
`};export{e as default};