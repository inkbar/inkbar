<script lang="ts">
  import { allTools } from '@inkbar/core/dom'

  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSignatureDialog from '../../lib/components/InkSignatureDialog.svelte'
  import InkSignatureMenu from '../../lib/components/InkSignatureMenu.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkToolButton from '../../lib/components/InkToolButton.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import HookProbe from './HookProbe.svelte'
  import SignatureOptionsProbe from './SignatureOptionsProbe.svelte'

  import type { DocumentSource, InkStorage, PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    storage,
    fonts,
    bare = false,
  }: {
    src: DocumentSource
    assets: PdfAssets
    storage: InkStorage
    fonts?: string[] | undefined
    /** No tools: a plain button opens the dialog in place of the menu. */
    bare?: boolean
  } = $props()
  const tools = allTools()
  let dialog = $state(false)
</script>

<InkRoot
  {src}
  {assets}
  zoom={1}
  {storage}
  signatureFonts={fonts}
  tools={bare ? undefined : tools}
>
  <InkToolbar>
    <InkToolButton tool="select" />
    {#if bare}
      <button type="button" onclick={() => (dialog = true)}>Open dialog</button>
    {:else}
      <InkSignatureMenu />
    {/if}
  </InkToolbar>
  {#if bare}<InkSignatureDialog bind:open={dialog} />{/if}
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px">
    <InkViewport />
  </div>
  {#if !bare}<SignatureOptionsProbe />{/if}
  <HookProbe />
</InkRoot>
