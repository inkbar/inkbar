<script lang="ts">
  /*
   * A fixture whose pages, thumbnails and loupes the engine draws: the route turned core's
   * switch on before this mounted. The status names the reader that drew them, for the tests.
   */
  import { allTools } from '@inkbar/core/dom'
  import { readerOf } from '@inkbar/e2e-shared/engine-reader'
  import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
  import {
    InkOutline,
    InkPanel,
    InkRoot,
    InkShapeMenu,
    InkSidebar,
    InkThumbnails,
    InkToolbar,
    InkToolButton,
    InkViewport,
    InkZoomIn,
  } from '@inkbar/svelte'
  import { assets } from 'virtual:inkbar-assets'

  import type { InkDocument } from '@inkbar/core'

  let { fixture }: { fixture: string } = $props()

  const engine = () => import('@inkbar/engine')
  const tools = allTools()
  const src = $derived({ url: fixtureUrl(fixture as FixtureName), key: fixture })
  let status = $state('loading')
  let reader = $state('')

  function onReady(doc: InkDocument): void {
    reader = readerOf(doc)
    status = 'ready'
  }
</script>

<InkRoot
  {src}
  {assets}
  {engine}
  {tools}
  class="sandbox-root"
  {onReady}
  onError={() => (status = 'error')}
>
  <InkToolbar>
    <InkToolButton tool="select-text" />
    <InkShapeMenu />
    <InkZoomIn />
  </InkToolbar>
  <div style="display: flex; flex: 1 1 auto; min-height: 0">
    <InkSidebar side="left">
      <InkPanel id="outline" label="Outline">
        <InkOutline />
      </InkPanel>
      <InkPanel id="thumbnails" label="Thumbnails">
        <InkThumbnails />
      </InkPanel>
    </InkSidebar>
    <div class="sandbox-editor" style="flex: 1 1 auto; min-width: 0">
      <InkViewport />
    </div>
  </div>
  <p class="sandbox-status" role="status" data-testid="status" data-reader={reader}>
    {status}
  </p>
</InkRoot>
