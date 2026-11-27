<script lang="ts">
  /*
   * Form filling needs no creation tools: the viewer passes none. Fields edit in place, and
   * the document keeps their values and undo history, so Undo covers field edits too.
   * Signature fields sign from a popover with a saved signature, from the store and fonts
   * passed here. The form's requests (submit, open a link, print) come to onaction,
   * because Inkbar never sends, opens or prints anything itself.
   */
  import {
    InkDownloadButton,
    InkPrintButton,
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
  } from '@inkbar/svelte'
  import '@inkbar/theme/theme.css'
  import { onDestroy } from 'svelte'
  import { assets } from 'virtual:inkbar-assets'

  import { FileUp } from '../../shared/file-up'
  import { changedFields } from '../../shared/form'
  import { signatureFonts, storage } from '../../shared/signatures'

  import type { ScenarioProps } from '../../frameworks/types'
  import type { FieldValues, ViewerAction, InkDocument } from '@inkbar/core'

  let { source, messages, locale, log, onDocument, openFile }: ScenarioProps = $props()

  /** Stops following the open document's field values. */
  let unfollow = (): void => undefined
  onDestroy(() => unfollow())

  function onReady(doc: InkDocument): void {
    log('onReady', { pages: doc.pages.length })
    // The field values are a readable on the form: follow them while the document is open.
    unfollow()
    let before: FieldValues = doc.form.values.get()
    unfollow = doc.form.values.subscribe((values) => {
      log('form.values', { fields: changedFields(before, values) })
      before = values
    })
    onDocument(doc)
  }

  function onaction(action: ViewerAction): void {
    log('onaction', action)
  }
</script>

<InkRoot
  src={source}
  {messages}
  {locale}
  {assets}
  {storage}
  {signatureFonts}
  {onReady}
  {onaction}
  class="scenario-root"
>
  <InkToolbar class="scenario-toolbar">
    <div class="scenario-group" role="group" aria-label="Tools">
      <InkToolButton tool="select-text" />
      <InkToolButton tool="select" />
    </div>
    <InkUndo />
    <InkRedo />
    <div class="scenario-group scenario-file" role="group" aria-label="File">
      <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" onclick={openFile}>
        <InkIcon icon={FileUp} />
        Open
      </InkToolbarButton>
      <InkDownloadButton />
      <InkPrintButton />
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
