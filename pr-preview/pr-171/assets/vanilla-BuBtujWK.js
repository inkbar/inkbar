import{A as e,Bt as t,C as n,D as r,E as i,F as a,I as o,Jt as s,L as c,N as l,P as u,R as d,S as f,T as p,Xt as m,Yt as h,a as g,b as _,i as v,j as y,k as b,n as x,o as S,r as C,s as w,t as T,v as E,w as D,x as O,z as k}from"./suggestion-card-Sy02Vl8Q.js";var A={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/* Suggest redactions: a custom control, added to the demo's toolbar. */</span></span>
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
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> suggest </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> button</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Suggest redactions'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> result </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'span'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  result.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'demo-result'</span></span>
<span class="line"><span style="color:#C9CEE6">  result.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'role'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'status'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> group </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'div'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  group.className </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> 'demo-actions'</span></span>
<span class="line"><span style="color:#C9CEE6">  group.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'role'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'group'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  group.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Suggest'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  group.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(suggest, result)</span></span>
<span class="line"><span style="color:#C9CEE6">  toolbar.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(group)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#FFFFFF"> bind</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> (doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> null)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    result.textContent </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> ''</span></span>
<span class="line"><span style="color:#C9CEE6">    suggest.disabled </span><span style="color:#9DABFF">=</span><span style="color:#9DABFF"> !</span><span style="color:#C9CEE6">doc</span></span>
<span class="line"><span style="color:#9DABFF">    if</span><span style="color:#C9CEE6"> (</span><span style="color:#9DABFF">!</span><span style="color:#C9CEE6">doc) {</span></span>
<span class="line"><span style="color:#C9CEE6">      suggest.onclick </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> null</span></span>
<span class="line"><span style="color:#9DABFF">      return</span></span>
<span class="line"><span style="color:#C9CEE6">    }</span></span>
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
<span class="line"><span style="color:#C9CEE6">      group.</span><span style="color:#FFFFFF">remove</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    },</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/* Suggest redactions: a custom control, added to the demo's toolbar. */
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
  const suggest = button('Suggest redactions')
  const result = document.createElement('span')
  result.className = 'demo-result'
  result.setAttribute('role', 'status')
  const group = document.createElement('div')
  group.className = 'demo-actions'
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', 'Suggest')
  group.append(suggest, result)
  toolbar.append(group)

  const bind = (doc: InkDocument | null): void => {
    result.textContent = ''
    suggest.disabled = !doc
    if (!doc) {
      suggest.onclick = null
      return
    }
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
      group.remove()
    },
  }
}
`};function j(e){let t=document.createElement(`button`);return t.type=`button`,t.textContent=e,t}function M(e,n){let r=j(`Suggest redactions`),i=document.createElement(`span`);i.className=`demo-result`,i.setAttribute(`role`,`status`);let a=document.createElement(`div`);a.className=`demo-actions`,a.setAttribute(`role`,`group`),a.setAttribute(`aria-label`,`Suggest`),a.append(r,i),e.append(a);let o=e=>{i.textContent=``,r.disabled=!e,e?r.onclick=()=>{r.disabled=!0,x(e,e.annotations.list.get()).then(t=>{e.history.batch(()=>{for(let n of t)e.annotations.add(n)}),n.get()===e&&(i.textContent=C(t.length))}).catch(r=>{n.get()===e&&(t(r)&&r.code===`DocumentDestroyed`||(i.textContent=`Could not check this document.`))}).finally(()=>{n.get()===e&&(r.disabled=!1)})}:r.onclick=null};o(n.get());let s=n.subscribe(o);return{destroy(){s(),a.remove()}}}function N(e,t,...n){let r=document.createElement(`div`);return r.className=t,r.setAttribute(`role`,`group`),r.setAttribute(`aria-label`,e),r.append(...n),r}function P(t,s){let m=o(t,{source:s,assets:w,signatures:S,signatureFonts:g,decorateAnnotation:v});m.element.classList.add(`demo-root`);let h=null,x=e=>{h?.destroy(),h=e?T({root:m.element,store:e.annotations,activated:m.activated,setActivated:e=>m.setActivated(e)}):null};x(m.document.get());let C=m.document.subscribe(x),A=l();A.classList.add(`demo-toolbar`),A.append(_(m),N(`Tools`,`demo-group`,y(m,`select-text`),y(m,`select`),y(m,`redact-area`),y(m,`sketch`),y(m,`draw`),r(m),y(m,`freetext`),b(m),y(m,`note`)),u(),N(`Style`,`demo-group`,O(m),E(m,{property:`border`}),E(m,{property:`fill`}),e(m)),a(m),i(m));let j=M(A,m.document),P=l({label:`Page and zoom`});return P.classList.add(`demo-status-bar`),P.append(N(`Page`,`demo-group`,p(m),D(m),n(m),f(m)),N(`Zoom`,`demo-group demo-zoom`,d(m),k(m),c(m))),m.element.prepend(A),m.element.append(P),()=>{C(),h?.destroy(),j.destroy(),m.destroy()}}s({framework:`vanilla`,files:[{path:`src/vanilla/Demo.ts`,source:{html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Inkbar without a framework: createViewer opens the document and renders the viewer and its</span></span>
<span class="line"><span style="color:#A9AFCB"> * popovers. The toolbars are built from Inkbar's controls, so each one is yours to keep, move</span></span>
<span class="line"><span style="color:#A9AFCB"> * or drop, and each button takes your own icon in place of the one it shows. Suggest</span></span>
<span class="line"><span style="color:#A9AFCB"> * redactions is the app's own extension: its button is in actions.ts, its review card in</span></span>
<span class="line"><span style="color:#A9AFCB"> * shared/suggestion-card.ts.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  createColorMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createHighlightMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createLineStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createTextStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createRedo,</span></span>
<span class="line"><span style="color:#C9CEE6">  createShapeMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createSignatureMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolbarSeparator,</span></span>
<span class="line"><span style="color:#C9CEE6">  createToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  createUndo,</span></span>
<span class="line"><span style="color:#C9CEE6">  createViewer,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">  createZoomSelect,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { signatureFonts, signatures } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../shared/signatures'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { decorateSuggestion } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../shared/suggestion'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { mountSuggestionCard } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../shared/suggestion-card'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { addActions } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> './actions'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { DocumentSource, InkDocument } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">function</span><span style="color:#FFFFFF"> group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#C9CEE6">  label</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string,</span></span>
<span class="line"><span style="color:#C9CEE6">  className</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string,</span></span>
<span class="line"><span style="color:#9DABFF">  ...</span><span style="color:#C9CEE6">controls</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">[]</span></span>
<span class="line"><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> g </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> document.</span><span style="color:#FFFFFF">createElement</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'div'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  g.className </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> className</span></span>
<span class="line"><span style="color:#C9CEE6">  g.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'role'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'group'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  g.</span><span style="color:#FFFFFF">setAttribute</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'aria-label'</span><span style="color:#C9CEE6">, label)</span></span>
<span class="line"><span style="color:#C9CEE6">  g.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span><span style="color:#9DABFF">...</span><span style="color:#C9CEE6">controls)</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> g</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> mountDemo</span><span style="color:#C9CEE6">(el</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> HTMLElement</span><span style="color:#C9CEE6">, source</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> DocumentSource</span><span style="color:#C9CEE6">)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> void {</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> viewer </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createViewer</span><span style="color:#C9CEE6">(el, {</span></span>
<span class="line"><span style="color:#C9CEE6">    source,</span></span>
<span class="line"><span style="color:#C9CEE6">    assets,</span></span>
<span class="line"><span style="color:#C9CEE6">    signatures,</span></span>
<span class="line"><span style="color:#C9CEE6">    signatureFonts,</span></span>
<span class="line"><span style="color:#C9CEE6">    decorateAnnotation: decorateSuggestion,</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'demo-root'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">  // The suggestion review card, remounted for each document opened.</span></span>
<span class="line"><span style="color:#9DABFF">  let</span><span style="color:#C9CEE6"> card</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> { </span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void } </span><span style="color:#9DABFF">|</span><span style="color:#C9CEE6"> null </span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A"> null</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#FFFFFF"> mountCard</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> (doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#9DABFF"> |</span><span style="color:#C9CEE6"> null)</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> void </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">    card?.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    card </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> doc</span></span>
<span class="line"><span style="color:#9DABFF">      ?</span><span style="color:#FFFFFF"> mountSuggestionCard</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">          root: viewer.element,</span></span>
<span class="line"><span style="color:#C9CEE6">          store: doc.annotations,</span></span>
<span class="line"><span style="color:#C9CEE6">          activated: viewer.activated,</span></span>
<span class="line"><span style="color:#FFFFFF">          setActivated</span><span style="color:#C9CEE6">: (id) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> viewer.</span><span style="color:#FFFFFF">setActivated</span><span style="color:#C9CEE6">(id),</span></span>
<span class="line"><span style="color:#C9CEE6">        })</span></span>
<span class="line"><span style="color:#9DABFF">      :</span><span style="color:#E4FF4A"> null</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#FFFFFF">  mountCard</span><span style="color:#C9CEE6">(viewer.document.</span><span style="color:#FFFFFF">get</span><span style="color:#C9CEE6">())</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> stopCard </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> viewer.document.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">(mountCard)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> tools </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createToolbar</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'demo-toolbar'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    createHighlightMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Tools'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'demo-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'select-text'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'select'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'redact-area'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'sketch'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'draw'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createShapeMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'freetext'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createSignatureMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'note'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#FFFFFF">    createToolbarSeparator</span><span style="color:#C9CEE6">(),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Style'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'demo-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createLineStyleMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createColorMenu</span><span style="color:#C9CEE6">(viewer, { property: </span><span style="color:#E4FF4A">'border'</span><span style="color:#C9CEE6"> }),</span></span>
<span class="line"><span style="color:#FFFFFF">      createColorMenu</span><span style="color:#C9CEE6">(viewer, { property: </span><span style="color:#E4FF4A">'fill'</span><span style="color:#C9CEE6"> }),</span></span>
<span class="line"><span style="color:#FFFFFF">      createTextStyleMenu</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#FFFFFF">    createUndo</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">    createRedo</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> actions </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> addActions</span><span style="color:#C9CEE6">(tools, viewer.document)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> status </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createToolbar</span><span style="color:#C9CEE6">({ label: </span><span style="color:#E4FF4A">'Page and zoom'</span><span style="color:#C9CEE6"> })</span></span>
<span class="line"><span style="color:#C9CEE6">  status.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'demo-status-bar'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  status.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Page'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'demo-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createPrevPage</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createPageInput</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createPageCount</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createNextPage</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Zoom'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'demo-group demo-zoom'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createZoomOut</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createZoomSelect</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createZoomIn</span><span style="color:#C9CEE6">(viewer)</span></span>
<span class="line"><span style="color:#C9CEE6">    )</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.</span><span style="color:#FFFFFF">prepend</span><span style="color:#C9CEE6">(tools)</span></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(status)</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">    stopCard</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    card?.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    actions.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    viewer.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Inkbar without a framework: createViewer opens the document and renders the viewer and its
 * popovers. The toolbars are built from Inkbar's controls, so each one is yours to keep, move
 * or drop, and each button takes your own icon in place of the one it shows. Suggest
 * redactions is the app's own extension: its button is in actions.ts, its review card in
 * shared/suggestion-card.ts.
 */
import {
  createColorMenu,
  createHighlightMenu,
  createLineStyleMenu,
  createTextStyleMenu,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createRedo,
  createShapeMenu,
  createSignatureMenu,
  createToolbar,
  createToolbarSeparator,
  createToolButton,
  createUndo,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
} from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { signatureFonts, signatures } from '../shared/signatures'
import { decorateSuggestion } from '../shared/suggestion'
import { mountSuggestionCard } from '../shared/suggestion-card'

import { addActions } from './actions'

import type { DocumentSource, InkDocument } from '@inkbar/core'

function group(
  label: string,
  className: string,
  ...controls: HTMLElement[]
): HTMLElement {
  const g = document.createElement('div')
  g.className = className
  g.setAttribute('role', 'group')
  g.setAttribute('aria-label', label)
  g.append(...controls)
  return g
}

export function mountDemo(el: HTMLElement, source: DocumentSource): () => void {
  const viewer = createViewer(el, {
    source,
    assets,
    signatures,
    signatureFonts,
    decorateAnnotation: decorateSuggestion,
  })
  viewer.element.classList.add('demo-root')

  // The suggestion review card, remounted for each document opened.
  let card: { destroy(): void } | null = null
  const mountCard = (doc: InkDocument | null): void => {
    card?.destroy()
    card = doc
      ? mountSuggestionCard({
          root: viewer.element,
          store: doc.annotations,
          activated: viewer.activated,
          setActivated: (id) => viewer.setActivated(id),
        })
      : null
  }
  mountCard(viewer.document.get())
  const stopCard = viewer.document.subscribe(mountCard)

  const tools = createToolbar()
  tools.classList.add('demo-toolbar')
  tools.append(
    createHighlightMenu(viewer),
    group(
      'Tools',
      'demo-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select'),
      createToolButton(viewer, 'redact-area'),
      createToolButton(viewer, 'sketch'),
      createToolButton(viewer, 'draw'),
      createShapeMenu(viewer),
      createToolButton(viewer, 'freetext'),
      createSignatureMenu(viewer),
      createToolButton(viewer, 'note')
    ),
    createToolbarSeparator(),
    group(
      'Style',
      'demo-group',
      createLineStyleMenu(viewer),
      createColorMenu(viewer, { property: 'border' }),
      createColorMenu(viewer, { property: 'fill' }),
      createTextStyleMenu(viewer)
    ),
    createUndo(viewer),
    createRedo(viewer)
  )
  const actions = addActions(tools, viewer.document)

  const status = createToolbar({ label: 'Page and zoom' })
  status.classList.add('demo-status-bar')
  status.append(
    group(
      'Page',
      'demo-group',
      createPrevPage(viewer),
      createPageInput(viewer),
      createPageCount(viewer),
      createNextPage(viewer)
    ),
    group(
      'Zoom',
      'demo-group demo-zoom',
      createZoomOut(viewer),
      createZoomSelect(viewer),
      createZoomIn(viewer)
    )
  )

  viewer.element.prepend(tools)
  viewer.element.append(status)
  return () => {
    stopCard()
    card?.destroy()
    actions.destroy()
    viewer.destroy()
  }
}
`}},{path:`src/vanilla/actions.ts`,source:A},{path:`src/shared/suggestion.ts`,source:h},{path:`src/shared/suggestion-card.ts`,source:m}],mount:P});