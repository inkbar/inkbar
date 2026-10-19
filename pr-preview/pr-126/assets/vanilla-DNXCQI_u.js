import{C as e,S as t,_ as n,b as r,c as i,d as a,f as o,g as s,h as c,m as l,n as u,p as d,r as f,t as p,u as m,ut as h,v as g,vt as _,w as v,x as y,y as b}from"./suggest-Cgaj5pCP.js";var x={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/* Suggest redactions: a custom control, added to the demo's toolbar. */</span></span>
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
`};function S(e){let t=document.createElement(`button`);return t.type=`button`,t.textContent=e,t}function C(e,t){let n=S(`Suggest redactions`),r=document.createElement(`span`);r.className=`demo-result`,r.setAttribute(`role`,`status`);let i=document.createElement(`div`);i.className=`demo-actions`,i.setAttribute(`role`,`group`),i.setAttribute(`aria-label`,`Suggest`),i.append(n,r),e.append(i);let a=e=>{r.textContent=``,n.disabled=!e,e?n.onclick=()=>{n.disabled=!0,p(e,e.annotations.list.get()).then(n=>{e.history.batch(()=>{for(let t of n)e.annotations.add(t)}),t.get()===e&&(r.textContent=u(n.length))}).catch(n=>{t.get()===e&&(h(n)&&n.code===`DocumentDestroyed`||(r.textContent=`Could not check this document.`))}).finally(()=>{t.get()===e&&(n.disabled=!1)})}:n.onclick=null};a(t.get());let o=t.subscribe(a);return{destroy(){o(),i.remove()}}}function w(e,t,...n){let r=document.createElement(`div`);return r.className=t,r.setAttribute(`role`,`group`),r.setAttribute(`aria-label`,e),r.append(...n),r}function T(u,p){let h=y(u,{source:p,assets:f});h.element.classList.add(`demo-root`);let _=g();_.classList.add(`demo-toolbar`),_.append(w(`Highlight`,`demo-group`,n(h,`highlight`)),w(`Tools`,`demo-group`,n(h,`select-text`),n(h,`select`),n(h,`redact-area`),s(h),n(h,`note`)),b(),w(`Style`,`demo-group`,m(h),i(h,{property:`border`}),i(h,{property:`fill`})),r(h),c(h));let x=C(_,h.document),S=g({label:`Page and zoom`});return S.classList.add(`demo-status-bar`),S.append(w(`Page`,`demo-group`,l(h),d(h),o(h),a(h)),w(`Zoom`,`demo-group demo-zoom`,e(h),v(h),t(h))),h.element.prepend(_),h.element.append(S),()=>{x.destroy(),h.destroy()}}_({framework:`vanilla`,files:[{path:`src/vanilla/Demo.ts`,source:{html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Inkbar without a framework: createViewer opens the document and renders the viewer and its</span></span>
<span class="line"><span style="color:#A9AFCB"> * popovers. The toolbars are built from Inkbar's controls, so each one is yours to keep, move</span></span>
<span class="line"><span style="color:#A9AFCB"> * or drop, and each button takes your own icon in place of the one it shows. Suggest</span></span>
<span class="line"><span style="color:#A9AFCB"> * redactions is a custom control, in actions.ts.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  createColorMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createLineStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  createPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  createRedo,</span></span>
<span class="line"><span style="color:#C9CEE6">  createShapeMenu,</span></span>
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
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { addActions } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> './actions'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { DocumentSource } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
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
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> viewer </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createViewer</span><span style="color:#C9CEE6">(el, { source, assets })</span></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'demo-root'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> tools </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createToolbar</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'demo-toolbar'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">  tools.</span><span style="color:#FFFFFF">append</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Highlight'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'demo-group'</span><span style="color:#C9CEE6">, </span><span style="color:#FFFFFF">createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'highlight'</span><span style="color:#C9CEE6">)),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Tools'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'demo-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'select-text'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'select'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'redact-area'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#FFFFFF">      createShapeMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createToolButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'note'</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#C9CEE6">    ),</span></span>
<span class="line"><span style="color:#FFFFFF">    createToolbarSeparator</span><span style="color:#C9CEE6">(),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span></span>
<span class="line"><span style="color:#E4FF4A">      'Style'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#E4FF4A">      'demo-group'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#FFFFFF">      createLineStyleMenu</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">      createColorMenu</span><span style="color:#C9CEE6">(viewer, { property: </span><span style="color:#E4FF4A">'border'</span><span style="color:#C9CEE6"> }),</span></span>
<span class="line"><span style="color:#FFFFFF">      createColorMenu</span><span style="color:#C9CEE6">(viewer, { property: </span><span style="color:#E4FF4A">'fill'</span><span style="color:#C9CEE6"> })</span></span>
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
<span class="line"><span style="color:#C9CEE6">    actions.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">    viewer.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Inkbar without a framework: createViewer opens the document and renders the viewer and its
 * popovers. The toolbars are built from Inkbar's controls, so each one is yours to keep, move
 * or drop, and each button takes your own icon in place of the one it shows. Suggest
 * redactions is a custom control, in actions.ts.
 */
import {
  createColorMenu,
  createLineStyleMenu,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createRedo,
  createShapeMenu,
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

import { addActions } from './actions'

import type { DocumentSource } from '@inkbar/core'

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
  const viewer = createViewer(el, { source, assets })
  viewer.element.classList.add('demo-root')

  const tools = createToolbar()
  tools.classList.add('demo-toolbar')
  tools.append(
    group('Highlight', 'demo-group', createToolButton(viewer, 'highlight')),
    group(
      'Tools',
      'demo-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select'),
      createToolButton(viewer, 'redact-area'),
      createShapeMenu(viewer),
      createToolButton(viewer, 'note')
    ),
    createToolbarSeparator(),
    group(
      'Style',
      'demo-group',
      createLineStyleMenu(viewer),
      createColorMenu(viewer, { property: 'border' }),
      createColorMenu(viewer, { property: 'fill' })
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
    actions.destroy()
    viewer.destroy()
  }
}
`}},{path:`src/vanilla/actions.ts`,source:x}],mount:T});