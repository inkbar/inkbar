<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import type { DocumentSource, InkDocument, PdfAssets } from '@inkbar/core'
  import type { AnnotationSlotProps, ToolId, ZoomValue } from '@inkbar/core/dom'

  let {
    src,
    assets,
    zoom,
    page,
    buffer = 2,
    gap = 16,
    customAnnotations = false,
    customLoading = false,
    tool,
    failPage,
    failText,
    onZoomChange,
    onPageChange,
  }: {
    src: DocumentSource | null
    assets: PdfAssets
    zoom?: ZoomValue | undefined
    page?: number | undefined
    buffer?: number
    gap?: number
    customAnnotations?: boolean
    customLoading?: boolean
    tool?: ToolId | undefined
    /** Zero-based page whose page lookups reject until the Heal button is pressed. */
    failPage?: number | undefined
    /** Zero-based page whose text content fails to load (its canvas still renders). */
    failText?: number | undefined
    onZoomChange?: ((z: ZoomValue) => void) | undefined
    onPageChange?: ((p: number) => void) | undefined
  } = $props()

  let clicks = $state(0)
  // A host that keeps its viewport options in one object and makes a new one, with the same
  // values, on every Restate press: the viewport's `gap` and `buffer` props are invalidated
  // without changing.
  let restated = $state(0)
  const options = $derived({ gap, buffer, restated })
  // Stands in for a page the engine cannot render: the canvas and text layer both look the
  // page up through `_pdfjs.getPage`, so failing it fails that page's mount and nothing else.
  let failing = true
  function heal(): void {
    failing = false
  }
  function onReady(doc: InkDocument): void {
    const target = failPage
    const textTarget = failText
    if (target === undefined && textTarget === undefined) return
    const handles = doc._pdfjs
    const original = handles.getPage.bind(handles)
    handles.getPage = async (index) => {
      if (failing && index === target)
        throw new Error('The page could not be drawn by the engine')
      const pdfPage = await original(index)
      // Only the text layer streams text content: failing the stream fails that layer alone.
      if (index === textTarget) {
        pdfPage.streamTextContent = () =>
          new ReadableStream({
            start: (controller) => controller.error(new Error('No text from the engine')),
          })
      }
      return pdfPage
    }
  }
</script>

{#snippet loadingSlot()}
  <span data-testid="custom-loading">Opening the file</span>
{/snippet}

{#snippet pin({
  annotation,
  state: pinState,
  locked,
  select,
  accept,
  dismiss,
}: AnnotationSlotProps)}
  <span
    class="my-pin"
    data-type={annotation.type}
    data-pin-state={pinState}
    data-pin-locked={String(locked)}
  >
    Pin
  </span>
  {#if annotation.type === 'redact' && annotation.origin === 'suggested'}
    <button type="button" data-testid="select" onclick={select}>Select</button>
    <button type="button" data-testid="accept" onclick={accept}>Accept</button>
    <button type="button" data-testid="dismiss" onclick={dismiss}>Dismiss</button>
    <input data-testid="slot-input" aria-label="Comment" />
  {/if}
{/snippet}

<div>
  <button type="button" data-testid="outside" onclick={() => (clicks += 1)}>
    Outside {clicks}
  </button>
  <button type="button" data-testid="heal" onclick={heal}>Heal</button>
  <button type="button" data-testid="restate" onclick={() => (restated += 1)}>
    Restated {restated}
  </button>
  <InkRoot {src} {assets} {zoom} {page} {tool} {onZoomChange} {onPageChange} {onReady}>
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 700px; width: 900px">
      <InkViewport
        buffer={options.buffer}
        gap={options.gap}
        loading={customLoading ? loadingSlot : undefined}
        annotation={customAnnotations ? pin : undefined}
      />
    </div>
  </InkRoot>
</div>
