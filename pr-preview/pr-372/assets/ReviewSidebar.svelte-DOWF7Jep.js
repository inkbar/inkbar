import"./client-DlM7410A.js";var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6"> lang=</span><span style="color:#E4FF4A">"ts"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#A9AFCB">  /*</span></span>
<span class="line"><span style="color:#A9AFCB">   * The right sidebar. Suggestions lists the plugin's open suggestions as the cards their marks</span></span>
<span class="line"><span style="color:#A9AFCB">   * open. Accepted is your own component on useRecords: Undo accept puts a suggestion back up</span></span>
<span class="line"><span style="color:#A9AFCB">   * for review and removes its redaction, in one undo step. The sidebar opens Suggestions when</span></span>
<span class="line"><span style="color:#A9AFCB">   * the Suggest command finishes. It sits inside InkRoot to reach the records and the command.</span></span>
<span class="line"><span style="color:#A9AFCB">   */</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { Check, SquareDashed } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/icons'</span></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    InkPanel,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkRecordList,</span></span>
<span class="line"><span style="color:#C9CEE6">    InkSidebar,</span></span>
<span class="line"><span style="color:#C9CEE6">    useAnnotations,</span></span>
<span class="line"><span style="color:#C9CEE6">    useCommand,</span></span>
<span class="line"><span style="color:#C9CEE6">    useRecords,</span></span>
<span class="line"><span style="color:#C9CEE6">  } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/svelte'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#C9CEE6"> { acceptedFrom, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> Suggestion } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../plugin/suggestions'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { SidebarOpen } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> suggestions </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useRecords</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">'sandbox.suggestions'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> annotations </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useAnnotations</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> command </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useCommand</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'sandbox.suggest'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  /** Closed until Suggest has something to show. */</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> open </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">state</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">SidebarOpen</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">null</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> wasBusy </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> false</span></span>
<span class="line"><span style="color:#C9CEE6">  $</span><span style="color:#FFFFFF">effect</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> busy </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> command.busy</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (wasBusy </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">busy) open </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'suggestions'</span></span>
<span class="line"><span style="color:#C9CEE6">    wasBusy </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> busy</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> openCount </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">derived</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">    suggestions.records.</span><span style="color:#FFFFFF">filter</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> s.status </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'suggested'</span><span style="color:#C9CEE6">).length</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> accepted </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> $</span><span style="color:#FFFFFF">derived</span><span style="color:#C9CEE6">(suggestions.records.</span><span style="color:#FFFFFF">filter</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> s.status </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'accepted'</span><span style="color:#C9CEE6">))</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> undoAccept</span><span style="color:#C9CEE6">(suggestion</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#C9CEE6"> records </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> suggestions.handle</span></span>
<span class="line"><span style="color:#C9CEE6">    records?.</span><span style="color:#FFFFFF">batch</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">      records.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">(suggestion.id, { status: </span><span style="color:#E4FF4A">'suggested'</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#9DABFF">      for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> a </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> annotations.annotations)</span></span>
<span class="line"><span style="color:#9DABFF">        if</span><span style="color:#C9CEE6"> (</span><span style="color:#FFFFFF">acceptedFrom</span><span style="color:#C9CEE6">(a) </span><span style="color:#9DABFF">===</span><span style="color:#C9CEE6"> suggestion.id) annotations.</span><span style="color:#FFFFFF">remove</span><span style="color:#C9CEE6">(a.id)</span></span>
<span class="line"><span style="color:#C9CEE6">    })</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6"> name=</span><span style="color:#E4FF4A">"redactions-right"</span><span style="color:#C9CEE6"> side=</span><span style="color:#E4FF4A">"right"</span><span style="color:#C9CEE6"> layout=</span><span style="color:#E4FF4A">"rail"</span><span style="color:#9DABFF"> bind</span><span style="color:#C9CEE6">:open></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"suggestions"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Suggestions"</span><span style="color:#C9CEE6"> icon={SquareDashed} badge={openCount}></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkRecordList</span><span style="color:#C9CEE6"> records=</span><span style="color:#E4FF4A">"sandbox.suggestions"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"accepted"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Accepted"</span><span style="color:#C9CEE6"> icon={Check}></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"accepted"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      {#</span><span style="color:#9DABFF">if</span><span style="color:#C9CEE6"> accepted.length </span><span style="color:#9DABFF">></span><span style="color:#E4FF4A"> 0</span><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">ul</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          {#</span><span style="color:#9DABFF">each</span><span style="color:#C9CEE6"> accepted </span><span style="color:#9DABFF">as</span><span style="color:#C9CEE6"> s (s.id)}</span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">li</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">              &#x3C;</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"accepted-reason"</span><span style="color:#C9CEE6">>{s.reason}&#x3C;/</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">              &#x3C;</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"accepted-meta"</span><span style="color:#C9CEE6">>{s.text}, page {s.page </span><span style="color:#9DABFF">+</span><span style="color:#E4FF4A"> 1</span><span style="color:#C9CEE6">}&#x3C;/</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">              &#x3C;</span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6"> type=</span><span style="color:#E4FF4A">"button"</span><span style="color:#C9CEE6"> onclick={() </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> undoAccept</span><span style="color:#C9CEE6">(s)}>Undo accept&#x3C;/</span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;/</span><span style="color:#FFFFFF">li</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          {/</span><span style="color:#9DABFF">each</span><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">ul</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      {:</span><span style="color:#9DABFF">else</span><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">p</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"accepted-empty"</span><span style="color:#C9CEE6">>Nothing accepted yet.&#x3C;/</span><span style="color:#FFFFFF">p</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      {/</span><span style="color:#9DABFF">if</span><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span></code></pre>`,code:`<script lang="ts">
  /*
   * The right sidebar. Suggestions lists the plugin's open suggestions as the cards their marks
   * open. Accepted is your own component on useRecords: Undo accept puts a suggestion back up
   * for review and removes its redaction, in one undo step. The sidebar opens Suggestions when
   * the Suggest command finishes. It sits inside InkRoot to reach the records and the command.
   */
  import { Check, SquareDashed } from '@inkbar/icons'
  import {
    InkPanel,
    InkRecordList,
    InkSidebar,
    useAnnotations,
    useCommand,
    useRecords,
  } from '@inkbar/svelte'

  import { acceptedFrom, type Suggestion } from '../../plugin/suggestions'

  import type { SidebarOpen } from '@inkbar/core/dom'

  const suggestions = useRecords<Suggestion>('sandbox.suggestions')
  const annotations = useAnnotations()
  const command = useCommand('sandbox.suggest')

  /** Closed until Suggest has something to show. */
  let open = $state<SidebarOpen>(null)
  let wasBusy = false
  $effect(() => {
    const busy = command.busy
    if (wasBusy && !busy) open = 'suggestions'
    wasBusy = busy
  })

  const openCount = $derived(
    suggestions.records.filter((s) => s.status === 'suggested').length
  )
  const accepted = $derived(suggestions.records.filter((s) => s.status === 'accepted'))

  function undoAccept(suggestion: Suggestion): void {
    const records = suggestions.handle
    records?.batch(() => {
      records.update(suggestion.id, { status: 'suggested' })
      for (const a of annotations.annotations)
        if (acceptedFrom(a) === suggestion.id) annotations.remove(a.id)
    })
  }
<\/script>

<InkSidebar name="redactions-right" side="right" layout="rail" bind:open>
  <InkPanel id="suggestions" label="Suggestions" icon={SquareDashed} badge={openCount}>
    <InkRecordList records="sandbox.suggestions" />
  </InkPanel>
  <InkPanel id="accepted" label="Accepted" icon={Check}>
    <div class="accepted">
      {#if accepted.length > 0}
        <ul>
          {#each accepted as s (s.id)}
            <li>
              <span class="accepted-reason">{s.reason}</span>
              <span class="accepted-meta">{s.text}, page {s.page + 1}</span>
              <button type="button" onclick={() => undoAccept(s)}>Undo accept</button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="accepted-empty">Nothing accepted yet.</p>
      {/if}
    </div>
  </InkPanel>
</InkSidebar>
`};export{e as default};