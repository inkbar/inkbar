<script lang="ts">
  import { allTools } from '@inkbar/core/dom'
  import { untrack } from 'svelte'

  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'
  import type { ToolId } from '@inkbar/core/dom'

  let {
    src,
    assets,
    tool,
    bare = false,
    follow = false,
    onToolChange,
  }: {
    src: DocumentSource
    assets: PdfAssets
    tool: ToolId
    /** Passes no creation tools. */
    bare?: boolean
    /** Follows `onToolChange` as a bound host would; otherwise it keeps passing `tool`. */
    follow?: boolean
    onToolChange?: ((t: ToolId) => void) | undefined
  } = $props()
  // The host's own copy of the tool, fed back only when it follows.
  let current = $state<ToolId>(untrack(() => tool))
  const tools = allTools()

  function onTool(t: ToolId): void {
    if (follow) current = t
    onToolChange?.(t)
  }
</script>

<InkRoot
  {src}
  {assets}
  zoom={1}
  tool={follow ? current : tool}
  tools={bare ? [] : tools}
  onToolChange={onTool}
>
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px"><InkViewport /></div>
</InkRoot>
