<script lang="ts">
  /*
   * A form fixture, opened with Inkbar keeping both annotations and field values, so its own
   * history undoes a field commit and the calculation it caused in one step. Form actions are
   * listed, newest first, because Inkbar never acts on them itself. On the engine-reader route
   * the page is given the engine, and the status names the reader, for the tests.
   */
  import { readerOf } from '@inkbar/e2e-shared/engine-reader'
  import { describeAction } from '@inkbar/e2e-shared/form-actions'
  import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
  import {
    InkNextPage,
    InkPageCount,
    InkPageInput,
    InkPrevPage,
    InkRedo,
    InkRoot,
    InkToolbar,
    InkToolButton,
    InkUndo,
    InkViewport,
  } from '@inkbar/svelte'
  import { assets } from 'virtual:inkbar-assets'

  import type { InkDocument, ViewerAction } from '@inkbar/core'

  let { fixture, engineReader = false }: { fixture: string; engineReader?: boolean } =
    $props()

  const engine = () => import('@inkbar/engine')

  const src = $derived({ url: fixtureUrl(fixture as FixtureName), key: fixture })
  let status = $state('loading')
  let actions = $state<string[]>([])
  let reader = $state('')

  function onReady(doc: InkDocument): void {
    reader = readerOf(doc)
    status = 'ready'
  }

  function onaction(a: ViewerAction): void {
    actions = [describeAction(a), ...actions]
  }
</script>

<InkRoot
  {src}
  {assets}
  engine={engineReader ? engine : undefined}
  class="sandbox-root"
  {onReady}
  onError={() => (status = 'error')}
  {onaction}
>
  <InkToolbar>
    <InkToolButton tool="select-text" />
    <InkToolButton tool="select" />
    <InkUndo />
    <InkRedo />
  </InkToolbar>
  <div class="sandbox-editor">
    <InkViewport />
    <InkToolbar label="Page">
      <InkPrevPage />
      <InkPageInput />
      <InkPageCount />
      <InkNextPage />
    </InkToolbar>
  </div>
  <ol class="sandbox-actions" aria-label="Form actions" data-testid="form-actions">
    {#each actions as line, i (actions.length - i)}
      <li>{line}</li>
    {/each}
  </ol>
  <p class="sandbox-status" role="status" data-testid="status" data-reader={reader}>
    {status}
  </p>
</InkRoot>
