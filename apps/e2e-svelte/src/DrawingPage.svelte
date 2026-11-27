<script lang="ts">
  /*
   * A fixture with its thumbnails and outline beside the pages, and the shape tools, which
   * draw loupes.
   */
  import { allTools } from '@inkbar/core/dom'
  import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
  import {
    InkFindBar,
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

  let { fixture }: { fixture: string } = $props()

  const tools = allTools()
  const src = $derived({ url: fixtureUrl(fixture as FixtureName), key: fixture })
  let status = $state('loading')

  function onReady(): void {
    status = 'ready'
  }
</script>

<InkRoot
  {src}
  {assets}
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
      <InkFindBar />
    </div>
  </div>
  <p class="sandbox-status" role="status" data-testid="status">
    {status}
  </p>
</InkRoot>
