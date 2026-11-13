<script module lang="ts">
  import type { DocumentSource, InkMessagesInput, PdfAssets } from '@inkbar/core'
  import type { ZoomValue } from '@inkbar/core/dom'

  export interface MessagesHarnessProps {
    src: DocumentSource
    assets: PdfAssets
    messages?: InkMessagesInput | undefined
    locale?: string | undefined
    zoom?: ZoomValue | undefined
    /** Attributes the host passes to the root. */
    rootAttrs?: { lang?: string | undefined } | undefined
  }
  export type MessagesWindow = Window & { __inkDrawWord?: string | undefined }
</script>

<script lang="ts">
  import { allTools } from '@inkbar/core/dom'

  import InkHighlightMenu from '../../lib/components/InkHighlightMenu.svelte'
  import InkNextPage from '../../lib/components/InkNextPage.svelte'
  import InkPrevPage from '../../lib/components/InkPrevPage.svelte'
  import InkRedo from '../../lib/components/InkRedo.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSearchButton from '../../lib/components/InkSearchButton.svelte'
  import InkShapeMenu from '../../lib/components/InkShapeMenu.svelte'
  import InkThreadPopover from '../../lib/components/InkThreadPopover.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkToolButton from '../../lib/components/InkToolButton.svelte'
  import InkUndo from '../../lib/components/InkUndo.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'
  import InkZoomSelect from '../../lib/components/InkZoomSelect.svelte'

  let { src, assets, messages, locale, zoom, rootAttrs }: MessagesHarnessProps = $props()

  const tools = allTools()
  /** A host label that reads its own language, which the test changes before new messages. */
  const drawLabel = (): string => (window as MessagesWindow).__inkDrawWord ?? 'Pen'
</script>

<InkRoot {...rootAttrs} {src} {assets} zoom={zoom ?? 1} {tools} {messages} {locale}>
  <InkToolbar>
    <InkSearchButton />
    <InkUndo />
    <InkRedo />
    <InkPrevPage />
    <InkNextPage />
    <InkHighlightMenu />
    <InkShapeMenu />
    <InkToolButton tool="draw" label={drawLabel} />
    <InkZoomSelect />
  </InkToolbar>
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px">
    <InkViewport />
  </div>
  <InkThreadPopover />
</InkRoot>
