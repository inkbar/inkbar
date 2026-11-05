import"./client-1m3KnP2g.js";var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6"> lang=</span><span style="color:#E4FF4A">"ts"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#A9AFCB">  /* Logs each result of the Suggest command. It sits inside InkRoot to reach the command. */</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { useCommand } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/svelte'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { Log } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> { log }</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> { log</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Log</span><span style="color:#C9CEE6"> } </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">props</span><span style="color:#C9CEE6">()</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> command </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useCommand</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'sandbox.suggest'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  $</span><span style="color:#FFFFFF">effect</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (command.status) </span><span style="color:#FFFFFF">log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'command'</span><span style="color:#C9CEE6">, command.status)</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span></code></pre>`,code:`<script lang="ts">
  /* Logs each result of the Suggest command. It sits inside InkRoot to reach the command. */
  import { useCommand } from '@inkbar/svelte'

  import type { Log } from '../../frameworks/types'

  let { log }: { log: Log } = $props()

  const command = useCommand('sandbox.suggest')
  $effect(() => {
    if (command.status) log('command', command.status)
  })
<\/script>
`};export{e as default};