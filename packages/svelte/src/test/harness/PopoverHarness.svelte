<script module lang="ts">
  import type { Annotation, DocumentSource, PdfAssets } from '@inkbar/core'
  import type { ToolId } from '@inkbar/core/dom'

  export interface PopoverHarnessProps {
    src: DocumentSource
    assets: PdfAssets
    /** The host owns the list. */
    controlled?: boolean | undefined
    /** Controlled only: apply each proposal this many ms late, like a slow host. */
    applyDelay?: number | undefined
    /** Fill annotation elements with host content (a button). */
    customAnnotations?: boolean | undefined
    /** Replace the note popover's default content with one snippet Remove button. */
    customNote?: boolean | undefined
    tool?: ToolId | undefined
  }
  export type HostWindow = Window & {
    __inkHostRemove?: ((id: string) => void) | undefined
    __inkActivate?: ((id: string) => void) | undefined
  }
</script>

<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkThreadPopover from '../../lib/components/InkThreadPopover.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import ActivateHook from './ActivateHook.svelte'

  import type { AnnotationSlotProps, ThreadPopoverSlotProps } from '@inkbar/core/dom'

  let {
    src,
    assets,
    controlled = false,
    applyDelay,
    customAnnotations = false,
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
</script>

{#snippet pin({ annotation }: AnnotationSlotProps)}
  <button type="button" data-testid="pin">Pin {annotation.type}</button>
{/snippet}
{#snippet noteRemove({ remove }: ThreadPopoverSlotProps)}
  <button type="button" data-testid="custom-remove" onclick={remove}>Remove</button>
{/snippet}

<!-- A function binding: unbound (`undefined`) when uncontrolled, the host's list otherwise. -->
<InkRoot
  {src}
  {assets}
  zoom={1}
  {tool}
  bind:annotations={() => (controlled ? list : undefined), onProposal}
>
  <output data-testid="proposals">{proposals}</output>
  <ActivateHook />
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px">
    <InkViewport annotation={customAnnotations ? pin : undefined} />
  </div>
  <InkThreadPopover children={customNote ? noteRemove : undefined} />
</InkRoot>
