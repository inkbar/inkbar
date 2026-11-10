var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * The presses plugin's markers: a 16 px ring centred on the point. A press is a hollow ring in</span></span>
<span class="line"><span style="color:#A9AFCB"> * the accent colour; a long press is a disc filled with the accent colour inside a ring in the</span></span>
<span class="line"><span style="color:#A9AFCB"> * text colour, so the two differ by fill as well as colour.</span></span>
<span class="line"><span style="color:#A9AFCB"> *</span></span>
<span class="line"><span style="color:#A9AFCB"> * Markers only show where a press landed. They let presses through to the page, so pressing</span></span>
<span class="line"><span style="color:#A9AFCB"> * the same spot again still reaches the viewer.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#C9CEE6">.presses-marker {</span></span>
<span class="line"><span style="color:#C9CEE6">  position: absolute;</span></span>
<span class="line"><span style="color:#C9CEE6">  box-sizing: border-box;</span></span>
<span class="line"><span style="color:#C9CEE6">  width: </span><span style="color:#E4FF4A">16</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  height: </span><span style="color:#E4FF4A">16</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  margin: </span><span style="color:#E4FF4A">-8</span><span style="color:#9DABFF">px</span><span style="color:#E4FF4A"> 0</span><span style="color:#E4FF4A"> 0</span><span style="color:#E4FF4A"> -8</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  border: </span><span style="color:#E4FF4A">2</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6"> solid var(--ink-accent);</span></span>
<span class="line"><span style="color:#C9CEE6">  border-radius: </span><span style="color:#E4FF4A">50</span><span style="color:#9DABFF">%</span><span style="color:#C9CEE6">;</span></span>
<span class="line"><span style="color:#C9CEE6">  background: transparent;</span></span>
<span class="line"><span style="color:#C9CEE6">  box-shadow: </span><span style="color:#E4FF4A">0</span><span style="color:#E4FF4A"> 0</span><span style="color:#E4FF4A"> 0</span><span style="color:#E4FF4A"> 1</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6"> var(--ink-surface);</span></span>
<span class="line"><span style="color:#C9CEE6">  pointer-events: none;</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"><span style="color:#C9CEE6">.presses-marker[data-kind</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">'long-press'</span><span style="color:#C9CEE6">] {</span></span>
<span class="line"><span style="color:#C9CEE6">  border-color: var(--ink-fg);</span></span>
<span class="line"><span style="color:#C9CEE6">  background: var(--ink-accent);</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * The presses plugin's markers: a 16 px ring centred on the point. A press is a hollow ring in
 * the accent colour; a long press is a disc filled with the accent colour inside a ring in the
 * text colour, so the two differ by fill as well as colour.
 *
 * Markers only show where a press landed. They let presses through to the page, so pressing
 * the same spot again still reaches the viewer.
 */
.presses-marker {
  position: absolute;
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border: 2px solid var(--ink-accent);
  border-radius: 50%;
  background: transparent;
  box-shadow: 0 0 0 1px var(--ink-surface);
  pointer-events: none;
}
.presses-marker[data-kind='long-press'] {
  border-color: var(--ink-fg);
  background: var(--ink-accent);
}
`};export{e as default};