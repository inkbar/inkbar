var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * Download and Print write the session into the PDF: each annotation as a standard PDF</span></span>
<span class="line"><span style="color:#A9AFCB"> * annotation other programs can read, and changed form values. With no changes you</span></span>
<span class="line"><span style="color:#A9AFCB"> * get the file as it was opened. Open the saved file here and Inkbar's own</span></span>
<span class="line"><span style="color:#A9AFCB"> * annotations come back ready to edit.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { highlightTool, noteTool } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core/dom'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  InkDownloadButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPrintButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkHighlightMenu,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkNextPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageCount,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPageInput,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkPrevPage,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkRedo,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkRoot,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkThreadPopover,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkIcon,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbar,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolbarButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkToolButton,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkUndo,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkViewport,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomIn,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomOut,</span></span>
<span class="line"><span style="color:#C9CEE6">  InkZoomSelect,</span></span>
<span class="line"><span style="color:#C9CEE6">} </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/react'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#E4FF4A"> '@inkbar/theme/theme.css'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { assets } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> 'virtual:inkbar-assets'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { FileUp } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/file-up'</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { storage } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../shared/signatures'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#9DABFF"> type</span><span style="color:#C9CEE6"> { ScenarioProps } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '../../frameworks/types'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">const</span><span style="color:#C9CEE6"> tools </span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6"> [</span><span style="color:#FFFFFF">highlightTool</span><span style="color:#C9CEE6">(), </span><span style="color:#FFFFFF">noteTool</span><span style="color:#C9CEE6">()]</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> default</span><span style="color:#9DABFF"> function</span><span style="color:#FFFFFF"> SaveAndReopen</span><span style="color:#C9CEE6">({</span></span>
<span class="line"><span style="color:#C9CEE6">  source,</span></span>
<span class="line"><span style="color:#C9CEE6">  messages,</span></span>
<span class="line"><span style="color:#C9CEE6">  locale,</span></span>
<span class="line"><span style="color:#C9CEE6">  labels,</span></span>
<span class="line"><span style="color:#C9CEE6">  log,</span></span>
<span class="line"><span style="color:#C9CEE6">  onDocument,</span></span>
<span class="line"><span style="color:#C9CEE6">  openFile,</span></span>
<span class="line"><span style="color:#C9CEE6">}</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> ScenarioProps</span><span style="color:#C9CEE6">) {</span></span>
<span class="line"><span style="color:#9DABFF">  return</span><span style="color:#C9CEE6"> (</span></span>
<span class="line"><span style="color:#C9CEE6">    &#x3C;</span><span style="color:#FFFFFF">InkRoot</span></span>
<span class="line"><span style="color:#C9CEE6">      src</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{source}</span></span>
<span class="line"><span style="color:#C9CEE6">      messages</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{messages}</span></span>
<span class="line"><span style="color:#C9CEE6">      locale</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{locale}</span></span>
<span class="line"><span style="color:#C9CEE6">      assets</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{assets}</span></span>
<span class="line"><span style="color:#C9CEE6">      storage</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{storage}</span></span>
<span class="line"><span style="color:#C9CEE6">      tools</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{tools}</span></span>
<span class="line"><span style="color:#C9CEE6">      onReady</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{(doc) </span><span style="color:#9DABFF">=></span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#FFFFFF">        log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onReady'</span><span style="color:#C9CEE6">, { pages: doc.pages.length })</span></span>
<span class="line"><span style="color:#FFFFFF">        onDocument</span><span style="color:#C9CEE6">(doc)</span></span>
<span class="line"><span style="color:#C9CEE6">      }}</span></span>
<span class="line"><span style="color:#C9CEE6">      onError</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{(error) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onError'</span><span style="color:#C9CEE6">, { code: error.code })}</span></span>
<span class="line"><span style="color:#C9CEE6">      onToolChange</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{(tool) </span><span style="color:#9DABFF">=></span><span style="color:#FFFFFF"> log</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'onToolChange'</span><span style="color:#C9CEE6">, tool)}</span></span>
<span class="line"><span style="color:#C9CEE6">      className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-root"</span></span>
<span class="line"><span style="color:#C9CEE6">    ></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-toolbar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{labels.tools}></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkHighlightMenu</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"select-text"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"select"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolButton</span><span style="color:#C9CEE6"> tool</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"note"</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{labels.history}></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkUndo</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkRedo</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span></span>
<span class="line"><span style="color:#C9CEE6">          className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group scenario-file"</span></span>
<span class="line"><span style="color:#C9CEE6">          role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span></span>
<span class="line"><span style="color:#C9CEE6">          aria-label</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{labels.file}</span></span>
<span class="line"><span style="color:#C9CEE6">        ></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkToolbarButton</span></span>
<span class="line"><span style="color:#C9CEE6">            aria-label</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{labels.openPdf}</span></span>
<span class="line"><span style="color:#C9CEE6">            title</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{labels.openPdf}</span></span>
<span class="line"><span style="color:#C9CEE6">            onClick</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{openFile}</span></span>
<span class="line"><span style="color:#C9CEE6">          ></span></span>
<span class="line"><span style="color:#C9CEE6">            &#x3C;</span><span style="color:#FFFFFF">InkIcon</span><span style="color:#C9CEE6"> icon</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{FileUp} /></span></span>
<span class="line"><span style="color:#C9CEE6">            {labels.open}</span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;/</span><span style="color:#FFFFFF">InkToolbarButton</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkDownloadButton</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkPrintButton</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;/</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkViewport</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">      &#x3C;</span><span style="color:#FFFFFF">InkToolbar</span><span style="color:#C9CEE6"> label</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{labels.pageAndZoom} className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-status-bar"</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6"> className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group"</span><span style="color:#C9CEE6"> role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span><span style="color:#C9CEE6"> aria-label</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{labels.page}></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkPrevPage</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkPageInput</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkPageCount</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">          &#x3C;</span><span style="color:#FFFFFF">InkNextPage</span><span style="color:#C9CEE6"> /></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;/</span><span style="color:#FFFFFF">div</span><span style="color:#C9CEE6">></span></span>
<span class="line"><span style="color:#C9CEE6">        &#x3C;</span><span style="color:#FFFFFF">div</span></span>
<span class="line"><span style="color:#C9CEE6">          className</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"scenario-group scenario-zoom"</span></span>
<span class="line"><span style="color:#C9CEE6">          role</span><span style="color:#9DABFF">=</span><span style="color:#E4FF4A">"group"</span></span>
<span class="line"><span style="color:#C9CEE6">          aria-label</span><span style="color:#9DABFF">=</span><span style="color:#C9CEE6">{labels.zoom}</span></span>
<span class="line"><span style="color:#C9CEE6">        ></span></span>
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
 * Download and Print write the session into the PDF: each annotation as a standard PDF
 * annotation other programs can read, and changed form values. With no changes you
 * get the file as it was opened. Open the saved file here and Inkbar's own
 * annotations come back ready to edit.
 */
import { highlightTool, noteTool } from '@inkbar/core/dom'
import {
  InkDownloadButton,
  InkPrintButton,
  InkHighlightMenu,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkThreadPopover,
  InkIcon,
  InkToolbar,
  InkToolbarButton,
  InkToolButton,
  InkUndo,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'

const tools = [highlightTool(), noteTool()]

export default function SaveAndReopen({
  source,
  messages,
  locale,
  labels,
  log,
  onDocument,
  openFile,
}: ScenarioProps) {
  return (
    <InkRoot
      src={source}
      messages={messages}
      locale={locale}
      assets={assets}
      storage={storage}
      tools={tools}
      onReady={(doc) => {
        log('onReady', { pages: doc.pages.length })
        onDocument(doc)
      }}
      onError={(error) => log('onError', { code: error.code })}
      onToolChange={(tool) => log('onToolChange', tool)}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <div className="scenario-group" role="group" aria-label={labels.tools}>
          <InkHighlightMenu />
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
          <InkToolButton tool="note" />
        </div>
        <div className="scenario-group" role="group" aria-label={labels.history}>
          <InkUndo />
          <InkRedo />
        </div>
        <div
          className="scenario-group scenario-file"
          role="group"
          aria-label={labels.file}
        >
          <InkToolbarButton
            aria-label={labels.openPdf}
            title={labels.openPdf}
            onClick={openFile}
          >
            <InkIcon icon={FileUp} />
            {labels.open}
          </InkToolbarButton>
          <InkDownloadButton />
          <InkPrintButton />
        </div>
      </InkToolbar>
      <InkViewport />
      <InkToolbar label={labels.pageAndZoom} className="scenario-status-bar">
        <div className="scenario-group" role="group" aria-label={labels.page}>
          <InkPrevPage />
          <InkPageInput />
          <InkPageCount />
          <InkNextPage />
        </div>
        <div
          className="scenario-group scenario-zoom"
          role="group"
          aria-label={labels.zoom}
        >
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