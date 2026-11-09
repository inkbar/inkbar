var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
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
<span class="line"><span style="color:#A9AFCB">/* A ring of its own: the theme outlines the mark of the record selected in a list. */</span></span>
<span class="line"><span style="color:#C9CEE6">.sandbox-suggestion:focus-visible {</span></span>
<span class="line"><span style="color:#C9CEE6">  box-shadow:</span></span>
<span class="line"><span style="color:#E4FF4A">    0</span><span style="color:#E4FF4A"> 0</span><span style="color:#E4FF4A"> 0</span><span style="color:#E4FF4A"> 2</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6"> var(--ink-surface),</span></span>
<span class="line"><span style="color:#E4FF4A">    0</span><span style="color:#E4FF4A"> 0</span><span style="color:#E4FF4A"> 0</span><span style="color:#E4FF4A"> 4</span><span style="color:#9DABFF">px</span><span style="color:#C9CEE6"> var(--ink-ring);</span></span>
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
/* A ring of its own: the theme outlines the mark of the record selected in a list. */
.sandbox-suggestion:focus-visible {
  box-shadow:
    0 0 0 2px var(--ink-surface),
    0 0 0 4px var(--ink-ring);
}
`};export{e as default};