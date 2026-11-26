<script lang="ts">
  /*
   * A redaction fixture with the apply redactions control, opened with the engine. Controlled,
   * the host keeps the annotations through `bind:annotations` with history on and shows their
   * types. Each `onRedacted` call's bytes are kept for the tests, and "Open the redacted file"
   * passes the last as a new `src`. Same test ids and strings as the other sandboxes: all run the
   * shared suite.
   */
  import { allTools } from '@inkbar/core/dom'
  import { readerOf } from '@inkbar/e2e-shared/engine-reader'
  import { keepRedacted } from '@inkbar/e2e-shared/redaction-page'
  import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
  import {
    InkApplyRedactions,
    InkDownloadButton,
    InkRedo,
    InkRoot,
    InkToolbar,
    InkToolButton,
    InkUndo,
    InkViewport,
    InkZoomIn,
    InkZoomSelect,
  } from '@inkbar/svelte'
  import { assets } from 'virtual:inkbar-assets'

  import type {
    Annotation,
    DocumentSource,
    InkDocument,
    RedactionResult,
  } from '@inkbar/core'

  let {
    fixture,
    controlled,
    confirm,
  }: { fixture: string; controlled: boolean; confirm: boolean } = $props()

  const engine = () => import('@inkbar/engine')
  const tools = allTools()
  let status = $state('loading')
  /** Which reader opened the document, for the tests. */
  let reader = $state('')

  function onReady(doc: InkDocument): void {
    reader = readerOf(doc)
    status = 'ready'
  }
  let annotations = $state.raw<Annotation[]>([])
  // The route picks the first document; "Open the redacted file" replaces it.
  // svelte-ignore state_referenced_locally
  let src = $state.raw<DocumentSource>({
    url: fixtureUrl(fixture as FixtureName),
    key: fixture,
  })
  let last = $state.raw<Uint8Array | null>(null)
  let applied = $state.raw<RedactionResult | null>(null)
  const redactionConfirm = $derived(confirm ? undefined : (false as const))

  function onRedacted(e: { bytes: Uint8Array; result: RedactionResult }): void {
    keepRedacted(e.bytes)
    last = e.bytes
    applied = e.result
  }

  function openRedacted(): void {
    if (last) src = { data: last.slice(), key: `${fixture}-copy` }
  }
</script>

{#snippet content()}
  <InkToolbar>
    <InkToolButton tool="select-text" />
    <InkToolButton tool="redact-area" />
    <InkToolButton tool="shape" />
    <InkZoomSelect />
    <InkZoomIn />
    <InkUndo />
    <InkRedo />
    <InkApplyRedactions />
    <InkDownloadButton />
    <div class="sandbox-actions" role="group" aria-label="Redacted file">
      <button
        type="button"
        data-testid="open-redacted"
        disabled={!last}
        onclick={openRedacted}
      >
        Open the redacted file
      </button>
    </div>
  </InkToolbar>
  <div class="sandbox-editor">
    <InkViewport />
  </div>
  <p
    class="sandbox-status"
    role="status"
    data-testid="status"
    data-applied={applied?.marks ?? ''}
    data-reader={reader}
  >
    {status}
  </p>
  {#if controlled}
    <output class="sandbox-status" data-testid="host-list"
      >{annotations.map((a) => a.type).join(' ')}</output
    >
  {/if}
{/snippet}

{#if controlled}
  <InkRoot
    bind:annotations
    history={true}
    {tools}
    {src}
    {assets}
    {engine}
    {redactionConfirm}
    class="sandbox-root"
    {onReady}
    onError={() => (status = 'error')}
    {onRedacted}
  >
    {@render content()}
  </InkRoot>
{:else}
  <InkRoot
    {tools}
    {src}
    {assets}
    {engine}
    {redactionConfirm}
    class="sandbox-root"
    {onReady}
    onError={() => (status = 'error')}
    {onRedacted}
  >
    {@render content()}
  </InkRoot>
{/if}
