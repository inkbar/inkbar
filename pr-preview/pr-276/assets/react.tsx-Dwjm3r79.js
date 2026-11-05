var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Every creation tool, on a document that already has one of each annotation. The toolbars are</span></span>
<span class="line"><span style="color:#A9AFCB"> * built from Inkbar's components, so each control is yours to keep, move or drop. The viewer</span></span>
<span class="line"><span style="color:#A9AFCB"> * reports what happens through its callbacks; this file passes each one to \`log\`.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { allTools } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  InkColorMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkHighlightMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkLineStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkRedo,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkRoot,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkShapeMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkSignatureMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkTextStyleMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkThreadPopover,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbarButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbarSeparator,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkUndo,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkViewport,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomSelect,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/react'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { useEffect, useRef } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'react'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { FileUp } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/file-up'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { signatureFonts, signatures } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/signatures'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { InkDocument } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> tools </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> allTools</span><span style="color:#C9CEE6">()</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> default</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> AnnotationTour</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">  source,</span></span>
<span class="line"><span style="color:#C9CEE6">  log,</span></span>
<span class="line"><span style="color:#C9CEE6">  onDocument,</span></span>
<span class="line"><span style="color:#C9CEE6">  openFile,</span></span>
<span class="line"><span style="color:#C9CEE6">}</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioProps</span><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#A9AFCB">  /** Stops following the open document's annotations. */</span></span>
<span class="line"><span style="color:#9DABFF">  const</span><span style="color:#C9CEE6"> unfollow </span><span style="color:#9DABFF">=</span><span style="color:#FFFFFF"> useRef</span><span style="color:#C9CEE6">&#x3C;() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> void>(</span><span style="color:#E4FF4A">undefined</span><span style="color:#C9CEE6">)</span></span>
<span class="line"><span style="color:#FFFFFF">  useEffect</span><span style="color:#C9CEE6">(() </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> () </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> unfollow.</span><span style="color:#FFFFFF">current</span><span style="color:#C9CEE6">?.(), [])</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  function</span><span style="color:#FFFFFF"> onReady</span><span style="color:#C9CEE6">(doc</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> InkDocument</span><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#FFFFFF">    log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onReady'</span><span style="color:#C9CEE6">, { pages: doc.pages.length })</span></span>
<span class="line"><span style="color:#A9AFCB">    // The annotation list is a readable on the document: follow it while the document is open.</span></span>
<span class="line"><span style="color:#C9CEE6">    unfollow.</span><span style="color:#FFFFFF">current</span><span style="color:#C9CEE6">?.()</span></span>
<span class="line"><span style="color:#C9CEE6">    unfollow.current </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> doc.annotations.list.</span><span style="color:#FFFFFF">subscribe</span><span style="color:#C9CEE6">((list) </span><span style="color:#9DABFF">=></span></span>
<span class="line"><span style="color:#FFFFFF">      log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'annotations.list'</span><span style="color:#C9CEE6">, { count: list.length })</span></span>
<span class="line"><span style="color:#C9CEE6">    )</span></span>
<span class="line"><span style="color:#FFFFFF">    onDocument</span><span style="color:#C9CEE6">(doc)</span></span>
<span class="line"><span style="color:#C9CEE6">  }</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> (</span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkRoot</span></span>
<span class="line"><span style="color:#C9CEE6">      src</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{source}</span></span>
<span class="line"><span style="color:#C9CEE6">      assets</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{assets}</span></span>
<span class="line"><span style="color:#C9CEE6">      tools</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{tools}</span></span>
<span class="line"><span style="color:#C9CEE6">      signatures</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{signatures}</span></span>
<span class="line"><span style="color:#C9CEE6">      signatureFonts</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{signatureFonts}</span></span>
<span class="line"><span style="color:#C9CEE6">      onReady</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{onReady}</span></span>
<span class="line"><span style="color:#C9CEE6">      onToolChange</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{(tool) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onToolChange'</span><span style="color:#C9CEE6">, tool)}</span></span>
<span class="line"><span style="color:#C9CEE6">      onActivate</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{(id) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onActivate'</span><span style="color:#C9CEE6">, id)}</span></span>
<span class="line"><span style="color:#C9CEE6">      className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-root"</span></span>
<span class="line"><span style="color:#C9CEE6">    ></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-toolbar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkHighlightMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Tools"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"select-text"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"select"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"redact-area"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"sketch"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"draw"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkShapeMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"freetext"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkSignatureMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"note"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkToolbarSeparator</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Style"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkLineStyleMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkColorMenu</span><span style="color:#C9CEE6"> property</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"border"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkColorMenu</span><span style="color:#C9CEE6"> property</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"fill"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkTextStyleMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkUndo</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">InkRedo</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group scenario-file"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"File"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Open a PDF"</span><span style="color:#C9CEE6"> title</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Open a PDF"</span><span style="color:#C9CEE6"> onClick</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{openFile}></span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">InkIcon</span><span style="color:#C9CEE6"> icon</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{FileUp} /></span></span>
<span class="line"><span style="color:#C9CEE6">            Open</span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;/</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkViewport</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Page and zoom"</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-status-bar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Page"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkPrevPage</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkPageInput</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkPageCount</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkNextPage</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group scenario-zoom"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"Zoom"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkZoomOut</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkZoomSelect</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkZoomIn</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkThreadPopover</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;/</span><span style="color:#FFFFFF">InkRoot</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">  )</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * Every creation tool, on a document that already has one of each annotation. The toolbars are
 * built from Inkbar's components, so each control is yours to keep, move or drop. The viewer
 * reports what happens through its callbacks; this file passes each one to \`log\`.
 */
import { allTools } from '@inkbar/core/dom'
import {
  InkColorMenu,
  InkHighlightMenu,
  InkLineStyleMenu,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkShapeMenu,
  InkSignatureMenu,
  InkTextStyleMenu,
  InkThreadPopover,
  InkIcon,
  InkToolbar,
  InkToolbarButton,
  InkToolbarSeparator,
  InkToolButton,
  InkUndo,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { useEffect, useRef } from 'react'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { signatureFonts, signatures } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

const tools = allTools()

export default function AnnotationTour({
  source,
  log,
  onDocument,
  openFile,
}: ScenarioProps) {
  /** Stops following the open document's annotations. */
  const unfollow = useRef<() => void>(undefined)
  useEffect(() => () => unfollow.current?.(), [])

  function onReady(doc: InkDocument) {
    log('onReady', { pages: doc.pages.length })
    // The annotation list is a readable on the document: follow it while the document is open.
    unfollow.current?.()
    unfollow.current = doc.annotations.list.subscribe((list) =>
      log('annotations.list', { count: list.length })
    )
    onDocument(doc)
  }

  return (
    <InkRoot
      src={source}
      assets={assets}
      tools={tools}
      signatures={signatures}
      signatureFonts={signatureFonts}
      onReady={onReady}
      onToolChange={(tool) => log('onToolChange', tool)}
      onActivate={(id) => log('onActivate', id)}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <InkHighlightMenu />
        <div className="scenario-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
          <InkToolButton tool="redact-area" />
          <InkToolButton tool="sketch" />
          <InkToolButton tool="draw" />
          <InkShapeMenu />
          <InkToolButton tool="freetext" />
          <InkSignatureMenu />
          <InkToolButton tool="note" />
        </div>
        <InkToolbarSeparator />
        <div className="scenario-group" role="group" aria-label="Style">
          <InkLineStyleMenu />
          <InkColorMenu property="border" />
          <InkColorMenu property="fill" />
          <InkTextStyleMenu />
        </div>
        <InkUndo />
        <InkRedo />
        <div className="scenario-group scenario-file" role="group" aria-label="File">
          <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" onClick={openFile}>
            <InkIcon icon={FileUp} />
            Open
          </InkToolbarButton>
        </div>
      </InkToolbar>
      <InkViewport />
      <InkToolbar label="Page and zoom" className="scenario-status-bar">
        <div className="scenario-group" role="group" aria-label="Page">
          <InkPrevPage />
          <InkPageInput />
          <InkPageCount />
          <InkNextPage />
        </div>
        <div className="scenario-group scenario-zoom" role="group" aria-label="Zoom">
          <InkZoomOut />
          <InkZoomSelect />
          <InkZoomIn />
        </div>
      </InkToolbar>
      <InkThreadPopover />
    </InkRoot>
  )
}
`};export{e as default};