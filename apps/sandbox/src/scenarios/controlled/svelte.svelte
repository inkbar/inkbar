<script lang="ts">
  /*
   * Your app owns the annotation list. Bind `annotations` and Inkbar stops keeping its own:
   * every change lands in your state, and what you hold is what the viewer shows.
   * `onAnnotationsChange` hears each one. Embedded annotations stay in the file and never pass
   * through here.
   */
  import { allTools } from '@inkbar/core/dom'
  import {
    InkColorMenu,
    InkHighlightMenu,
    InkIcon,
    InkLineStyleMenu,
    InkNextPage,
    InkPageCount,
    InkPageInput,
    InkPrevPage,
    InkRoot,
    InkShapeMenu,
    InkSignatureMenu,
    InkTextStyleMenu,
    InkThreadPopover,
    InkToolbar,
    InkToolbarButton,
    InkToolbarSeparator,
    InkToolButton,
    InkViewport,
    InkZoomIn,
    InkZoomOut,
    InkZoomSelect,
  } from '@inkbar/svelte'
  import '@inkbar/theme/theme.css'
  import { assets } from 'virtual:inkbar-assets'

  import { FileUp } from '../../shared/file-up'
  import { signatureFonts, signatures } from '../../shared/signatures'

  import type { ScenarioProps } from '../../frameworks/types'
  import type { Annotation, InkDocument } from '@inkbar/core'

  let { source, log, onDocument, openFile }: ScenarioProps = $props()

  const tools = allTools()
  let annotations = $state.raw<Annotation[]>([])

  function onReady(doc: InkDocument): void {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }
</script>

<InkRoot
  src={source}
  {assets}
  {tools}
  {signatures}
  {signatureFonts}
  bind:annotations
  onAnnotationsChange={(next) => log('onAnnotationsChange', { count: next.length })}
  {onReady}
  onToolChange={(tool) => log('onToolChange', tool)}
  onActivate={(id) => log('onActivate', id)}
  class="scenario-root"
>
  <InkToolbar class="scenario-toolbar">
    <InkHighlightMenu />
    <div class="scenario-group" role="group" aria-label="Tools">
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
    <div class="scenario-group" role="group" aria-label="Style">
      <InkLineStyleMenu />
      <InkColorMenu property="border" />
      <InkColorMenu property="fill" />
      <InkTextStyleMenu />
    </div>
    <div class="scenario-group scenario-file" role="group" aria-label="File">
      <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" onclick={openFile}>
        <InkIcon icon={FileUp} />
        Open
      </InkToolbarButton>
    </div>
  </InkToolbar>
  <InkViewport />
  <InkToolbar label="Page and zoom" class="scenario-status-bar">
    <div class="scenario-group" role="group" aria-label="Page">
      <InkPrevPage />
      <InkPageInput />
      <InkPageCount />
      <InkNextPage />
    </div>
    <div class="scenario-group scenario-zoom" role="group" aria-label="Zoom">
      <InkZoomOut />
      <InkZoomSelect />
      <InkZoomIn />
    </div>
  </InkToolbar>
  <InkThreadPopover />
</InkRoot>
