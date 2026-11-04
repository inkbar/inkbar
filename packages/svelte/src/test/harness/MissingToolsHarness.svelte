<script lang="ts">
  import { highlightTool } from '@inkbar/core/dom'

  import InkHighlightMenu from '../../lib/components/InkHighlightMenu.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkShapeMenu from '../../lib/components/InkShapeMenu.svelte'
  import InkSignatureMenu from '../../lib/components/InkSignatureMenu.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkToolButton from '../../lib/components/InkToolButton.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import HookProbe from './HookProbe.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  /** A viewer with no `tools` (or only `highlight`), showing only the controls a test names. */
  let {
    src,
    assets,
    controls,
    highlight = false,
  }: {
    src: DocumentSource
    assets: PdfAssets
    controls: (
      'highlight-button' | 'hostile-button' | 'highlight' | 'shape' | 'signature'
    )[]
    /** Passes the highlight tool. */
    highlight?: boolean
  } = $props()
  const tools = [highlightTool()]
</script>

<InkRoot {src} {assets} zoom={1} tools={highlight ? tools : undefined}>
  <InkToolbar>
    <InkToolButton tool="select-text" />
    {#if controls.includes('highlight-button')}<InkToolButton tool="highlight" />{/if}
    {#if controls.includes('hostile-button')}<InkToolButton
        tool="highlight"
        aria-label="X"
        title="Hostile"><span>child</span></InkToolButton
      >{/if}
    {#if controls.includes('highlight')}<InkHighlightMenu />{/if}
    {#if controls.includes('shape')}<InkShapeMenu />{/if}
    {#if controls.includes('signature')}<InkSignatureMenu />{/if}
  </InkToolbar>
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px"><InkViewport /></div>
  <HookProbe />
</InkRoot>
