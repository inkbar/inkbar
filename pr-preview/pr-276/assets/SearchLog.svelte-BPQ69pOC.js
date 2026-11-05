import"./client-1m3KnP2g.js";var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6"> lang=</span><span style="color:#E4FF4A">"ts"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#A9AFCB">  /*</span></span>
<span class="line"><span style="color:#A9AFCB">   * Logs each finished search and each step to a hit, while the find bar is open. It sits</span></span>
<span class="line"><span style="color:#A9AFCB">   * inside InkRoot to reach search.</span></span>
<span class="line"><span style="color:#A9AFCB">   */</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { useSearch } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/svelte'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { Log } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> { log }</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> { log</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Log</span><span style="color:#C9CEE6"> } </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">props</span><span style="color:#C9CEE6">()</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> search </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useSearch</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> open </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">derived</span><span style="color:#C9CEE6">(search.state.open)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> query </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">derived</span><span style="color:#C9CEE6">(search.state.query)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> hits </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">derived</span><span style="color:#C9CEE6">(search.state.hits.length)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> current </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">derived</span><span style="color:#C9CEE6">(search.state.current)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> scanning </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">derived</span><span style="color:#C9CEE6">(search.state.scanning)</span></span>
<span class="line"><span style="color:#C9CEE6">  $</span><span style="color:#FFFFFF">effect</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (open </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> query </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">scanning) </span><span style="color:#FFFFFF">log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'search'</span><span style="color:#C9CEE6">, { query, hits, current })</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span></code></pre>`,code:`<script lang="ts">
  /*
   * Logs each finished search and each step to a hit, while the find bar is open. It sits
   * inside InkRoot to reach search.
   */
  import { useSearch } from '@inkbar/svelte'

  import type { Log } from '../../frameworks/types'

  let { log }: { log: Log } = $props()

  const search = useSearch()
  const open = $derived(search.state.open)
  const query = $derived(search.state.query)
  const hits = $derived(search.state.hits.length)
  const current = $derived(search.state.current)
  const scanning = $derived(search.state.scanning)
  $effect(() => {
    if (open && query && !scanning) log('search', { query, hits, current })
  })
<\/script>
`};export{e as default};