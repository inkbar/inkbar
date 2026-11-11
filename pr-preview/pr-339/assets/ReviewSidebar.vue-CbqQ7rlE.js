var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6"> setup lang=</span><span style="color:#E4FF4A">"ts"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * The right sidebar. Suggestions lists the plugin's open suggestions as the cards their marks</span></span>
<span class="line"><span style="color:#A9AFCB"> * open. Accepted is your own component on useRecords: Undo accept puts a suggestion back up for</span></span>
<span class="line"><span style="color:#A9AFCB"> * review and removes its redaction, in one undo step. The sidebar opens Suggestions when the</span></span>
<span class="line"><span style="color:#A9AFCB"> * Suggest command finishes. It sits inside InkRoot to reach the records and the command.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { Check, SquareDashed } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/icons'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPanel,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkRecordList,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkSidebar,</span></span>
<span class="line"><span style="color:#C9CEE6">  useAnnotations,</span></span>
<span class="line"><span style="color:#C9CEE6">  useCommand,</span></span>
<span class="line"><span style="color:#C9CEE6">  useRecords,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/vue'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { computed, ref, watch } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'vue'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { acceptedFrom, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> Suggestion } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../plugin/suggestions'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { SidebarOpen } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> { records, handle } </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useRecords</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">Suggestion</span><span style="color:#C9CEE6">>(</span><span style="color:#E4FF4A">'sandbox.suggestions'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> { annotations, remove } </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useAnnotations</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> { busy } </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useCommand</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'sandbox.suggest'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** Closed until Suggest has something to show. */</span></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> open </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> ref</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">SidebarOpen</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> undefined>(</span><span style="color:#E4FF4A">null</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#FFFFFF">watch</span><span style="color:#C9CEE6">(busy, (now, before) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  if</span><span style="color:#C9CEE6"> (before </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">now) open.value </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'suggestions'</span></span>
<span class="line"><span style="color:#C9CEE6">})</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> openCount </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> computed</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">  () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> records.value.</span><span style="color:#FFFFFF">filter</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> s.status </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'suggested'</span><span style="color:#C9CEE6">).length</span></span>
<span class="line"><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> accepted </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> computed</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> records.value.</span><span style="color:#FFFFFF">filter</span><span style="color:#C9CEE6">((s) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> s.status </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'accepted'</span><span style="color:#C9CEE6">))</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> undoAccept</span><span style="color:#C9CEE6">(suggestion</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Suggestion</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> records </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> handle.value</span></span>
<span class="line"><span style="color:#C9CEE6">  records?.</span><span style="color:#FFFFFF">batch</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    records.</span><span style="color:#FFFFFF">update</span><span style="color:#C9CEE6">(suggestion.id, { status: </span><span style="color:#E4FF4A">'suggested'</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#9DABFF">    for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> a </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> annotations.value) </span><span style="color:#9DABFF">if</span><span style="color:#C9CEE6"> (</span><span style="color:#FFFFFF">acceptedFrom</span><span style="color:#C9CEE6">(a) </span><span style="color:#9DABFF">===</span><span style="color:#C9CEE6"> suggestion.id) </span><span style="color:#FFFFFF">remove</span><span style="color:#C9CEE6">(a.id)</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">script</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">template</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6"> v-model:open=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">open</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6"> side=</span><span style="color:#E4FF4A">"right"</span><span style="color:#C9CEE6"> layout=</span><span style="color:#E4FF4A">"rail"</span><span style="color:#C9CEE6"> :default-width=</span><span style="color:#C9CEE6">"</span><span style="color:#E4FF4A">240</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkPanel</span></span>
<span class="line"><span style="color:#C9CEE6">      id=</span><span style="color:#E4FF4A">"suggestions"</span></span>
<span class="line"><span style="color:#C9CEE6">      label=</span><span style="color:#E4FF4A">"Suggestions"</span></span>
<span class="line"><span style="color:#C9CEE6">      :icon=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">SquareDashed</span><span style="color:#C9CEE6">"</span></span>
<span class="line"><span style="color:#C9CEE6">      :badge=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">openCount</span><span style="color:#C9CEE6">"</span></span>
<span class="line"><span style="color:#C9CEE6">    ></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkRecordList</span><span style="color:#C9CEE6"> records=</span><span style="color:#E4FF4A">"sandbox.suggestions"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6"> id=</span><span style="color:#E4FF4A">"accepted"</span><span style="color:#C9CEE6"> label=</span><span style="color:#E4FF4A">"Accepted"</span><span style="color:#C9CEE6"> :icon=</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">Check</span><span style="color:#C9CEE6">"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"accepted"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">ul</span><span style="color:#C9CEE6"> v-if=</span><span style="color:#E4FF4A">"accepted.length"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">li</span><span style="color:#C9CEE6"> v-for=</span><span style="color:#E4FF4A">"s in accepted"</span><span style="color:#C9CEE6"> :key=</span><span style="color:#E4FF4A">"s.id"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"accepted-reason"</span><span style="color:#C9CEE6">>{{ s.reason }}&#x3C;/</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6"> class=</span><span style="color:#E4FF4A">"accepted-meta"</span><span style="color:#C9CEE6">>{{ s.text }}, page {{ s.page + 1 }}&#x3C;/</span><span style="color:#FFFFFF">span</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6"> type=</span><span style="color:#E4FF4A">"button"</span><span style="color:#C9CEE6"> @click=</span><span style="color:#E4FF4A">"undoAccept(s)"</span><span style="color:#C9CEE6">>Undo accept&#x3C;/</span><span style="color:#FFFFFF">button</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;/</span><span style="color:#FFFFFF">li</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">ul</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">p</span><span style="color:#C9CEE6"> v-else class=</span><span style="color:#E4FF4A">"accepted-empty"</span><span style="color:#C9CEE6">>Nothing accepted yet.&#x3C;/</span><span style="color:#FFFFFF">p</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkPanel</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  &#x3C;/</span><span style="color:#FFFFFF">InkSidebar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">&#x3C;/</span><span style="color:#FFFFFF">template</span><span style="color:#C9CEE6">></span></span>
<span class="line"></span></code></pre>`,code:`<script setup lang="ts">
/*
 * The right sidebar. Suggestions lists the plugin's open suggestions as the cards their marks
 * open. Accepted is your own component on useRecords: Undo accept puts a suggestion back up for
 * review and removes its redaction, in one undo step. The sidebar opens Suggestions when the
 * Suggest command finishes. It sits inside InkRoot to reach the records and the command.
 */
import { Check, SquareDashed } from '@inkbar/icons'
import {
  InkPanel,
  InkRecordList,
  InkSidebar,
  useAnnotations,
  useCommand,
  useRecords,
} from '@inkbar/vue'
import { computed, ref, watch } from 'vue'

import { acceptedFrom, type Suggestion } from '../../plugin/suggestions'

import type { SidebarOpen } from '@inkbar/core/dom'

const { records, handle } = useRecords<Suggestion>('sandbox.suggestions')
const { annotations, remove } = useAnnotations()
const { busy } = useCommand('sandbox.suggest')

/** Closed until Suggest has something to show. */
const open = ref<SidebarOpen | undefined>(null)
watch(busy, (now, before) => {
  if (before && !now) open.value = 'suggestions'
})

const openCount = computed(
  () => records.value.filter((s) => s.status === 'suggested').length
)
const accepted = computed(() => records.value.filter((s) => s.status === 'accepted'))

function undoAccept(suggestion: Suggestion): void {
  const records = handle.value
  records?.batch(() => {
    records.update(suggestion.id, { status: 'suggested' })
    for (const a of annotations.value) if (acceptedFrom(a) === suggestion.id) remove(a.id)
  })
}
<\/script>

<template>
  <InkSidebar v-model:open="open" side="right" layout="rail" :default-width="240">
    <InkPanel
      id="suggestions"
      label="Suggestions"
      :icon="SquareDashed"
      :badge="openCount"
    >
      <InkRecordList records="sandbox.suggestions" />
    </InkPanel>
    <InkPanel id="accepted" label="Accepted" :icon="Check">
      <div class="accepted">
        <ul v-if="accepted.length">
          <li v-for="s in accepted" :key="s.id">
            <span class="accepted-reason">{{ s.reason }}</span>
            <span class="accepted-meta">{{ s.text }}, page {{ s.page + 1 }}</span>
            <button type="button" @click="undoAccept(s)">Undo accept</button>
          </li>
        </ul>
        <p v-else class="accepted-empty">Nothing accepted yet.</p>
      </div>
    </InkPanel>
  </InkSidebar>
</template>
`};export{e as default};