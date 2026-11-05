<script lang="ts">
  /*
   * Form filling needs no creation tools: the viewer passes none. Fields edit in place, and
   * the document keeps their values and undo history, so Undo covers field edits too.
   * Signature fields sign from a popover with a saved signature, from the store and fonts
   * passed here. The form's requests (submit, open a link, print) come to onformaction,
   * because Inkbar never sends, opens or prints anything itself.
   */
  import {
    InkNextPage,
    InkPageCount,
    InkPageInput,
    InkPrevPage,
    InkRedo,
    InkRoot,
    InkThreadPopover,
    InkToolbar,
    InkToolButton,
    InkUndo,
    InkViewport,
    InkZoomIn,
    InkZoomOut,
    InkZoomSelect,
  } from '@inkbar/svelte'
  import '@inkbar/theme/theme.css'
  import { assets } from 'virtual:inkbar-assets'

  import { signatureFonts, signatures } from '../../shared/signatures'

  import type { ScenarioProps } from '../../frameworks/types'
  import type { FormAction, InkDocument } from '@inkbar/core'

  let { source, log, onDocument }: ScenarioProps = $props()

  function onReady(doc: InkDocument): void {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }

  function onformaction(action: FormAction): void {
    log('onformaction', action)
  }
</script>

<InkRoot
  src={source}
  {assets}
  {signatures}
  {signatureFonts}
  {onReady}
  {onformaction}
  class="scenario-root"
>
  <InkToolbar class="scenario-toolbar">
    <div class="scenario-group" role="group" aria-label="Tools">
      <InkToolButton tool="select-text" />
      <InkToolButton tool="select" />
    </div>
    <InkUndo />
    <InkRedo />
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
