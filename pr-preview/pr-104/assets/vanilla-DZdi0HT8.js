import{T as e,_ as t,n,r,s as i,t as a}from"./suggest-63kE4jJN.js";var o={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/* Undo, Redo and Suggest redactions, added to the toolbar that createViewer renders. */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { isInkError, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> InkDocument, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> Readable } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { suggestionCount, suggestRedactions } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../shared/suggest'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> button</span><span style="color:#C9CEE6">(label</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLButtonElement</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> b </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'button'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  b.type </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'button'</span></span>
<span class="line"><span style="color:#C9CEE6">  b.textContent </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> label</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> b</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> addActions</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">  toolbar</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  current</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Readable</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">InkDocument</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> null></span></span>
<span class="line"><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> { </span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void } {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> undo </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> button</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Undo'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> redo </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> button</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Redo'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> suggest </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> button</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Suggest redactions'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> result </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'span'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  result.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'demo-result'</span></span>
<span class="line"><span style="color:#C9CEE6">  result.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'role'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'status'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> group </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'div'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  group.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'demo-actions'</span></span>
<span class="line"><span style="color:#C9CEE6">  group.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'role'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'group'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  group.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Edit'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  group.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(undo, redo, suggest, result)</span></span>
<span class="line"><span style="color:#C9CEE6">  toolbar.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(group)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> stops</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> (() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> void)[] </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> []</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#FFFFFF"> bind</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> (doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> null)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">    for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> stop </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> stops) </span><span style="color:#FFFFFF">stop</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    stops </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> []</span></span>
<span class="line"><span style="color:#C9CEE6">    result.textContent </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> ''</span></span>
<span class="line"><span style="color:#C9CEE6">    undo.disabled </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> redo.disabled </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> suggest.disabled </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">doc</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">!</span><span style="color:#C9CEE6">doc) {</span></span>
<span class="line"><span style="color:#C9CEE6">      undo.onclick </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> redo.onclick </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> suggest.onclick </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> null</span></span>
<span class="line"><span style="color:#9DABFF">      return</span></span>
<span class="line"><span style="color:#C9CEE6">    }</span></span>
<span class="line"><span style="color:#9DABFF">    const</span><span style="color:#FFFFFF"> watch</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> (r</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Readable</span><span style="color:#C9CEE6">&#x3C;boolean>, b</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLButtonElement</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">      b.disabled </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">r.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      stops.</span><span style="color:#FFFFFF">push</span><span style="color:#C9CEE6">(r.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">((can) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> (b.disabled </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">can)))</span></span>
<span class="line"><span style="color:#C9CEE6">    }</span></span>
<span class="line"><span style="color:#FFFFFF">    watch</span><span style="color:#C9CEE6">(doc.history.canUndo, undo)</span></span>
<span class="line"><span style="color:#FFFFFF">    watch</span><span style="color:#C9CEE6">(doc.history.canRedo, redo)</span></span>
<span class="line"><span style="color:#C9CEE6">    undo.</span><span style="color:#FFFFFF">onclick</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> doc.history.</span><span style="color:#FFFFFF">undo</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    redo.</span><span style="color:#FFFFFF">onclick</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> doc.history.</span><span style="color:#FFFFFF">redo</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    suggest.</span><span style="color:#FFFFFF">onclick</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">      suggest.disabled </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> true</span></span>
<span class="line"><span style="color:#9DABFF">      void</span><span style="color:#FFFFFF"> suggestRedactions</span><span style="color:#C9CEE6">(doc, doc.annotations.list.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">())</span></span>
<span class="line"><span style="color:#C9CEE6">        .</span><span style="color:#FFFFFF">then</span><span style="color:#C9CEE6">((found) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">          doc.history.</span><span style="color:#FFFFFF">batch</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">            for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> input </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> found) doc.annotations.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(input)</span></span>
<span class="line"><span style="color:#C9CEE6">          })</span></span>
<span class="line"><span style="color:#9DABFF">          if</span><span style="color:#C9CEE6"> (current.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">() </span><span style="color:#9DABFF">===</span><span style="color:#C9CEE6"> doc) result.textContent </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> suggestionCount</span><span style="color:#C9CEE6">(found.length)</span></span>
<span class="line"><span style="color:#C9CEE6">        })</span></span>
<span class="line"><span style="color:#C9CEE6">        .</span><span style="color:#FFFFFF">catch</span><span style="color:#C9CEE6">((e</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> unknown) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#A9AFCB">          // Opening another file mid-run destroys the document; that is not a failure.</span></span>
<span class="line"><span style="color:#9DABFF">          if</span><span style="color:#C9CEE6"> (current.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">() </span><span style="color:#9DABFF">!==</span><span style="color:#C9CEE6"> doc) </span><span style="color:#9DABFF">return</span></span>
<span class="line"><span style="color:#9DABFF">          if</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">!</span><span style="color:#C9CEE6">(</span><span style="color:#FFFFFF">isInkError</span><span style="color:#C9CEE6">(e) </span><span style="color:#9DABFF">&#x26;&#x26;</span><span style="color:#C9CEE6"> e.code </span><span style="color:#9DABFF">===</span><span style="color:#E4FF4A"> 'DocumentDestroyed'</span><span style="color:#C9CEE6">))</span></span>
<span class="line"><span style="color:#C9CEE6">            result.textContent </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'Could not check this document.'</span></span>
<span class="line"><span style="color:#C9CEE6">        })</span></span>
<span class="line"><span style="color:#C9CEE6">        .</span><span style="color:#FFFFFF">finally</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">          if</span><span style="color:#C9CEE6"> (current.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">() </span><span style="color:#9DABFF">===</span><span style="color:#C9CEE6"> doc) suggest.disabled </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> false</span></span>
<span class="line"><span style="color:#C9CEE6">        })</span></span>
<span class="line"><span style="color:#C9CEE6">    }</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#FFFFFF">  bind</span><span style="color:#C9CEE6">(current.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">())</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> stopCurrent </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> current.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">(bind)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">    destroy</span><span style="color:#C9CEE6">() {</span></span>
<span class="line"><span style="color:#FFFFFF">      stopCurrent</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#9DABFF">      for</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> stop </span><span style="color:#9DABFF">of</span><span style="color:#C9CEE6"> stops) </span><span style="color:#FFFFFF">stop</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">      group.</span><span style="color:#FFFFFF">remove</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/* Undo, Redo and Suggest redactions, added to the toolbar that createViewer renders. */
import { isInkError, type InkDocument, type Readable } from '@inkbar/core'

import { suggestionCount, suggestRedactions } from '../shared/suggest'

function button(label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  return b
}

export function addActions(
  toolbar: HTMLElement,
  current: Readable<InkDocument | null>
): { destroy(): void } {
  const undo = button('Undo')
  const redo = button('Redo')
  const suggest = button('Suggest redactions')
  const result = document.createElement('span')
  result.className = 'demo-result'
  result.setAttribute('role', 'status')
  const group = document.createElement('div')
  group.className = 'demo-actions'
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', 'Edit')
  group.append(undo, redo, suggest, result)
  toolbar.append(group)

  let stops: (() => void)[] = []
  const bind = (doc: InkDocument | null): void => {
    for (const stop of stops) stop()
    stops = []
    result.textContent = ''
    undo.disabled = redo.disabled = suggest.disabled = !doc
    if (!doc) {
      undo.onclick = redo.onclick = suggest.onclick = null
      return
    }
    const watch = (r: Readable<boolean>, b: HTMLButtonElement): void => {
      b.disabled = !r.get()
      stops.push(r.subscribe((can) => (b.disabled = !can)))
    }
    watch(doc.history.canUndo, undo)
    watch(doc.history.canRedo, redo)
    undo.onclick = () => doc.history.undo()
    redo.onclick = () => doc.history.redo()
    suggest.onclick = () => {
      suggest.disabled = true
      void suggestRedactions(doc, doc.annotations.list.get())
        .then((found) => {
          doc.history.batch(() => {
            for (const input of found) doc.annotations.add(input)
          })
          if (current.get() === doc) result.textContent = suggestionCount(found.length)
        })
        .catch((e: unknown) => {
          // Opening another file mid-run destroys the document; that is not a failure.
          if (current.get() !== doc) return
          if (!(isInkError(e) && e.code === 'DocumentDestroyed'))
            result.textContent = 'Could not check this document.'
        })
        .finally(() => {
          if (current.get() === doc) suggest.disabled = false
        })
    }
  }
  bind(current.get())
  const stopCurrent = current.subscribe(bind)

  return {
    destroy() {
      stopCurrent()
      for (const stop of stops) stop()
      group.remove()
    },
  }
}
`};function s(e){let t=document.createElement(`button`);return t.type=`button`,t.textContent=e,t}function c(e,r){let i=s(`Undo`),o=s(`Redo`),c=s(`Suggest redactions`),l=document.createElement(`span`);l.className=`demo-result`,l.setAttribute(`role`,`status`);let u=document.createElement(`div`);u.className=`demo-actions`,u.setAttribute(`role`,`group`),u.setAttribute(`aria-label`,`Edit`),u.append(i,o,c,l),e.append(u);let d=[],f=e=>{for(let e of d)e();if(d=[],l.textContent=``,i.disabled=o.disabled=c.disabled=!e,!e){i.onclick=o.onclick=c.onclick=null;return}let s=(e,t)=>{t.disabled=!e.get(),d.push(e.subscribe(e=>t.disabled=!e))};s(e.history.canUndo,i),s(e.history.canRedo,o),i.onclick=()=>e.history.undo(),o.onclick=()=>e.history.redo(),c.onclick=()=>{c.disabled=!0,a(e,e.annotations.list.get()).then(t=>{e.history.batch(()=>{for(let n of t)e.annotations.add(n)}),r.get()===e&&(l.textContent=n(t.length))}).catch(n=>{r.get()===e&&(t(n)&&n.code===`DocumentDestroyed`||(l.textContent=`Could not check this document.`))}).finally(()=>{r.get()===e&&(c.disabled=!1)})}};f(r.get());let p=r.subscribe(f);return{destroy(){p();for(let e of d)e();u.remove()}}}function l(e,t){let n=i(e,{source:t,assets:r});n.element.classList.add(`demo-root`);let a=n.toolbar?c(n.toolbar,n.document):void 0;return()=>{a?.destroy(),n.destroy()}}e({framework:`vanilla`,files:[{path:`src/vanilla/Demo.ts`,source:{html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Inkbar without a framework: createViewer opens the document and renders the viewer, its</span></span>
<span class="line"><span style="color:#A9AFCB"> * toolbar and its popovers. The Undo, Redo and Suggest controls are in actions.ts.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { createViewer } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { addActions } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> './actions'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { DocumentSource } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> mountDemo</span><span style="color:#C9CEE6">(el</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">, source</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> DocumentSource</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> viewer </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createViewer</span><span style="color:#C9CEE6">(el, { source, assets })</span></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'demo-root'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> actions </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.toolbar </span><span style="color:#9DABFF">?</span><span style="color:#FFFFFF"> addActions</span><span style="color:#C9CEE6">(viewer.toolbar, viewer.document) </span><span style="color:#9DABFF">:</span><span style="color:#E4FF4A"> undefined</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    actions?.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    viewer.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Inkbar without a framework: createViewer opens the document and renders the viewer, its
 * toolbar and its popovers. The Undo, Redo and Suggest controls are in actions.ts.
 */
import { createViewer } from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { addActions } from './actions'

import type { DocumentSource } from '@inkbar/core'

export function mountDemo(el: HTMLElement, source: DocumentSource): () => void {
  const viewer = createViewer(el, { source, assets })
  viewer.element.classList.add('demo-root')
  const actions = viewer.toolbar ? addActions(viewer.toolbar, viewer.document) : undefined
  return () => {
    actions?.destroy()
    viewer.destroy()
  }
}
`}},{path:`src/vanilla/actions.ts`,source:o}],mount:l});