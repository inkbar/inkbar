<script lang="ts">
  /*
   * The document keeps its own annotations and undo history. The page owns the form's values
   * (bind:fields) and hears the form's requests (onformaction), which the Form panel lists.
   * The toolbars are built from Inkbar's components, so each control is yours to keep, move or
   * drop. Pass a button your own icon to replace the one it shows. Suggest redactions is a
   * plugin (src/plugin/suggestions.ts): registered in `plugins`, with its button placed by
   * InkCommand.
   */
  import {
    InkColorMenu,
    InkCommand,
    InkFindBar,
    InkHighlightMenu,
    InkLineStyleMenu,
    InkTextStyleMenu,
    InkNextPage,
    InkPageCount,
    InkPageInput,
    InkPrevPage,
    InkRoot,
    InkSearchButton,
    InkShapeMenu,
    InkSignatureMenu,
    InkThreadPopover,
    InkRedo,
    InkToolbar,
    InkToolbarSeparator,
    InkToolButton,
    InkUndo,
    InkViewport,
    InkZoomIn,
    InkZoomOut,
    InkZoomSelect,
  } from '@inkbar/svelte'
  import '@inkbar/theme/theme.css'
  import { assets } from 'virtual:inkbar-assets'

  import { suggestionsPlugin } from '../plugin/suggestions'
  import '../plugin/suggestions.css'
  import { glossFields, logAction, type LoggedAction } from '../shared/form'
  import { signatureFonts, signatures } from '../shared/signatures'

  import type { DocumentSource, FieldValues, FormAction, InkDocument } from '@inkbar/core'

  let { source }: { source: DocumentSource } = $props()

  let doc: InkDocument | null = null
  let fields = $state.raw<FieldValues>({})
  let actions = $state<LoggedAction[]>([])
  let gloss = $state('')

  function onReady(d: InkDocument): void {
    doc = d
    gloss = glossFields(d)
  }

  function onformaction(a: FormAction): void {
    actions = logAction(actions, a)
  }
</script>

<InkRoot
  src={source}
  {assets}
  {signatures}
  {signatureFonts}
  plugins={[suggestionsPlugin()]}
  bind:fields
  onFieldsChange={() => (gloss = glossFields(doc))}
  {onformaction}
  {onReady}
  class="demo-root"
>
  <InkToolbar class="demo-toolbar">
    <InkHighlightMenu />
    <div class="demo-group" role="group" aria-label="Tools">
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
    <div class="demo-group" role="group" aria-label="Style">
      <InkLineStyleMenu />
      <InkColorMenu property="border" />
      <InkColorMenu property="fill" />
      <InkTextStyleMenu />
    </div>
    <InkUndo />
    <InkRedo />
    <InkSearchButton />
    <div class="demo-actions" role="group" aria-label="Suggest">
      <InkCommand id="sandbox.suggest" />
    </div>
  </InkToolbar>
  <div class="demo-body">
    <InkViewport />
    <!-- It scrolls, so it takes focus for keyboard scrolling. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <section class="demo-form" aria-labelledby="demo-form-title" tabindex="0">
      <h2 id="demo-form-title">Form</h2>
      <p>Inkbar never sends, opens or prints anything. The form's requests come here.</p>
      <h3>Actions</h3>
      {#if actions.length}
        <ol>
          {#each actions as a (a.id)}
            <li>{a.text}</li>
          {/each}
        </ol>
      {:else}
        <p>None yet. Try the buttons on page 6.</p>
      {/if}
      <h3>Fields as Gloss</h3>
      <pre>{gloss}</pre>
    </section>
  </div>
  <InkFindBar />
  <InkToolbar label="Page and zoom" class="demo-status-bar">
    <div class="demo-group" role="group" aria-label="Page">
      <InkPrevPage />
      <InkPageInput />
      <InkPageCount />
      <InkNextPage />
    </div>
    <div class="demo-group demo-zoom" role="group" aria-label="Zoom">
      <InkZoomOut />
      <InkZoomSelect />
      <InkZoomIn />
    </div>
  </InkToolbar>
  <InkThreadPopover />
</InkRoot>
