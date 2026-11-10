<script lang="ts">
  /*
   * The outline and links fixtures, with the outline in a left sidebar and Back and Forward in
   * the toolbar. Actions reach `window.__actions`, since Inkbar never opens a URL itself; the
   * button swaps the document in place, as a host opening another file would.
   */
  import { allTools } from '@inkbar/core/dom'
  import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
  import {
    InkBack,
    InkForward,
    InkOutline,
    InkPageCount,
    InkPageInput,
    InkPanel,
    InkRoot,
    InkSidebar,
    InkToolbar,
    InkToolButton,
    InkViewport,
  } from '@inkbar/svelte'
  import { assets } from 'virtual:inkbar-assets'

  import type { ViewerAction } from '@inkbar/core'

  let { fixture }: { fixture: string } = $props()

  const tools = allTools()
  // The route picks the first document; the button swaps it.
  // svelte-ignore state_referenced_locally
  let name = $state(fixture)
  const src = $derived({ url: fixtureUrl(name as FixtureName), key: name })
  let status = $state('loading')

  function onaction(a: ViewerAction): void {
    ;(window.__actions ??= []).push(a)
  }

  function swap(): void {
    status = 'loading'
    name = name === 'outline' ? 'links' : 'outline'
  }
</script>

<InkRoot
  {src}
  {assets}
  {tools}
  class="sandbox-root"
  onReady={() => (status = 'ready')}
  onError={() => (status = 'error')}
  {onaction}
>
  <InkToolbar>
    <InkBack />
    <InkForward />
    <InkToolButton tool="select-text" />
    <InkToolButton tool="highlight" />
    <button type="button" data-testid="swap" onclick={swap}>
      Open {name === 'outline' ? 'links' : 'outline'}
    </button>
  </InkToolbar>
  <div style="display: flex; flex: 1 1 auto; min-height: 0">
    <InkSidebar side="left">
      <InkPanel id="outline" label="Outline">
        <InkOutline />
      </InkPanel>
    </InkSidebar>
    <div class="sandbox-editor" style="flex: 1 1 auto; min-width: 0">
      <InkViewport />
      <InkToolbar label="Page">
        <InkPageInput />
        <InkPageCount />
      </InkToolbar>
    </div>
  </div>
  <p class="sandbox-status" role="status" data-testid="status">{status}</p>
</InkRoot>
