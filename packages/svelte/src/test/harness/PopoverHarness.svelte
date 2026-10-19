<script module lang="ts">
  import type { Annotation, DocumentSource, PdfAssets } from '@inkbar/core'
  import type { ToolId } from '@inkbar/core/dom'

  export interface PopoverHarnessProps {
    src: DocumentSource
    assets: PdfAssets
    seedSuggestions?: boolean | undefined
    /** The host owns the list. */
    controlled?: boolean | undefined
    /** Controlled only: apply each proposal this many ms late, like a slow host. */
    applyDelay?: number | undefined
    /** Fill annotation elements with host content (a button). */
    customAnnotations?: boolean | undefined
    /** Replace the card's default content with one snippet Remove button. */
    customCard?: boolean | undefined
    /** Replace the note popover's default content with one snippet Remove button. */
    customNote?: boolean | undefined
    tool?: ToolId | undefined
  }
  export type HostWindow = Window & {
    __inkHostRemove?: ((id: string) => void) | undefined
  }
</script>

<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSuggestionCard from '../../lib/components/InkSuggestionCard.svelte'
  import InkThreadPopover from '../../lib/components/InkThreadPopover.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import type { InkDocument } from '@inkbar/core'
  import type {
    AnnotationSlotProps,
    ThreadPopoverSlotProps,
    SuggestionCardSlotProps,
  } from '@inkbar/core/dom'

  let {
    src,
    assets,
    seedSuggestions = false,
    controlled = false,
    applyDelay,
    customAnnotations = false,
    customCard = false,
    customNote = false,
    tool,
  }: PopoverHarnessProps = $props()

  let list = $state.raw<Annotation[]>([])
  let proposals = $state(0)
  // The binding's type includes the unbound `undefined`; InkRoot only ever proposes a list.
  function onProposal(next: Annotation[] | undefined): void {
    if (!next) return
    proposals += 1
    if (applyDelay === undefined) list = next
    else setTimeout(() => (list = next), applyDelay)
  }
  // Test-only: the host drops an annotation from its own list, outside any popover.
  $effect(() => {
    ;(window as HostWindow).__inkHostRemove = (id) => {
      list = list.filter((a) => a.id !== id)
    }
    return () => {
      ;(window as HostWindow).__inkHostRemove = undefined
    }
  })
  function onReady(doc: InkDocument): void {
    if (!seedSuggestions) return
    doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 72, y: 670, width: 150, height: 20 },
      origin: 'suggested',
      suggestion: {
        confidence: 0.92,
        reason: 'third-party name',
        explanation: 'Names a person other than the data subject.',
      },
    })
    doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 72, y: 640, width: 150, height: 20 },
      origin: 'suggested',
      suggestion: { confidence: 0.3, reason: 'possible email' },
    })
  }
</script>

{#snippet pin({ annotation }: AnnotationSlotProps)}
  <button type="button" data-testid="pin">Pin {annotation.type}</button>
{/snippet}
{#snippet noteRemove({ remove }: ThreadPopoverSlotProps)}
  <button type="button" data-testid="custom-remove" onclick={remove}>Remove</button>
{/snippet}
{#snippet cardDismiss({ dismiss }: SuggestionCardSlotProps)}
  <button type="button" data-testid="custom-dismiss" onclick={dismiss}>Remove</button>
{/snippet}

<!-- A function binding: unbound (`undefined`) when uncontrolled, the host's list otherwise. -->
<InkRoot
  {src}
  {assets}
  zoom={1}
  {tool}
  bind:annotations={() => (controlled ? list : undefined), onProposal}
  {onReady}
>
  <output data-testid="proposals">{proposals}</output>
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px">
    <InkViewport annotation={customAnnotations ? pin : undefined} />
  </div>
  <InkThreadPopover children={customNote ? noteRemove : undefined} />
  <InkSuggestionCard children={customCard ? cardDismiss : undefined} />
</InkRoot>
