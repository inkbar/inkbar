import{Jt as e}from"./signatures-B_khF-cc.js";import{t}from"./Demo-Csiq_q1e.js";e({page:`vanilla`,files:[{path:`src/vanilla/Demo.ts`,source:{html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Inkbar without a framework: createViewer opens the document and renders the viewer and its</span></span>
<span class="line"><span style="color:#A9AFCB"> * popovers. The toolbars are built from Inkbar's controls, so each one is yours to keep, move</span></span>
<span class="line"><span style="color:#A9AFCB"> * or drop, and each button takes your own icon in place of the one it shows. Suggest</span></span>
<span class="line"><span style="color:#A9AFCB"> * redactions is a plugin (src/plugin/suggestions.ts): registered in \`plugins\`, with its button</span></span>
<span class="line"><span style="color:#A9AFCB"> * placed by createCommandButton.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  createColorMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  createCommandButton,</span></span>
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
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { suggestionsPlugin } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../plugin/suggestions'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '../plugin/suggestions.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { signatureFonts, signatures } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../shared/signatures'</span></span>
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
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> viewer </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> createViewer</span><span style="color:#C9CEE6">(el, {</span></span>
<span class="line"><span style="color:#C9CEE6">    source,</span></span>
<span class="line"><span style="color:#C9CEE6">    assets,</span></span>
<span class="line"><span style="color:#C9CEE6">    signatures,</span></span>
<span class="line"><span style="color:#C9CEE6">    signatureFonts,</span></span>
<span class="line"><span style="color:#C9CEE6">    plugins: [</span><span style="color:#FFFFFF">suggestionsPlugin</span><span style="color:#C9CEE6">()],</span></span>
<span class="line"><span style="color:#C9CEE6">  })</span></span>
<span class="line"><span style="color:#C9CEE6">  viewer.element.classList.</span><span style="color:#FFFFFF">add</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'demo-root'</span><span style="color:#C9CEE6">)</span></span>
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
<span class="line"><span style="color:#FFFFFF">    createRedo</span><span style="color:#C9CEE6">(viewer),</span></span>
<span class="line"><span style="color:#FFFFFF">    group</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'Suggest'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'demo-actions'</span><span style="color:#C9CEE6">, </span><span style="color:#FFFFFF">createCommandButton</span><span style="color:#C9CEE6">(viewer, </span><span style="color:#E4FF4A">'sandbox.suggest'</span><span style="color:#C9CEE6">))</span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
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
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> viewer.</span><span style="color:#FFFFFF">destroy</span><span style="color:#C9CEE6">()</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Inkbar without a framework: createViewer opens the document and renders the viewer and its
 * popovers. The toolbars are built from Inkbar's controls, so each one is yours to keep, move
 * or drop, and each button takes your own icon in place of the one it shows. Suggest
 * redactions is a plugin (src/plugin/suggestions.ts): registered in \`plugins\`, with its button
 * placed by createCommandButton.
 */
import {
  createColorMenu,
  createCommandButton,
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

import { suggestionsPlugin } from '../plugin/suggestions'
import '../plugin/suggestions.css'
import { signatureFonts, signatures } from '../shared/signatures'

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
  const viewer = createViewer(el, {
    source,
    assets,
    signatures,
    signatureFonts,
    plugins: [suggestionsPlugin()],
  })
  viewer.element.classList.add('demo-root')

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
    createRedo(viewer),
    group('Suggest', 'demo-actions', createCommandButton(viewer, 'sandbox.suggest'))
  )

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
  return () => viewer.destroy()
}
`}}],mount:t});