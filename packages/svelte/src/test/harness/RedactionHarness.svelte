<script lang="ts">
  /*
   * The apply redactions control in a toolbar over a document, with Download and Print, and a
   * thread popover that `window.__inkActivate` opens.
   * `own: 'child'` renders the host's own button through `child`, `own: 'div'` a `div` in its
   * place, and `own: 'children'` the control's snippet of `{ label, busy, disabled }`. `confirm` passes `redactionConfirm` as a function answering yes
   * or no, recording the marks of each preview in `previews`; `confirm: 'dialog'` leaves the
   * built-in dialog; without it the root applies without asking. `throwing` makes `onRedacted`
   * throw, and `shown: false` unmounts the root. `swap` is a source `onRedacted` passes as the
   * new `src`.
   *
   * `controlled` keeps the annotations in the host with history on: `bound` through a plain
   * `bind:annotations`, which takes every proposal at once; the others through a function
   * binding that takes every proposal at once except the one that follows `onRedacted` (the
   * redaction's): `late` holds it until the test calls `control.release()`, `never` drops it,
   * and `change` answers it with an empty list. Their types show in `list`, and the types of
   * every proposal the host hears in `proposals` (one list per `|`). The errors the root reports
   * show in `errors` (code, and the callback when there is one), and the `onRedacted` calls in
   * `redacted`.
   */
  import { allTools } from '@inkbar/core/dom'

  import InkApplyRedactions from '../../lib/components/InkApplyRedactions.svelte'
  import InkDownloadButton from '../../lib/components/InkDownloadButton.svelte'
  import InkPrintButton from '../../lib/components/InkPrintButton.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkThreadPopover from '../../lib/components/InkThreadPopover.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkToolButton from '../../lib/components/InkToolButton.svelte'
  import InkUndo from '../../lib/components/InkUndo.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import ActivateHook from './ActivateHook.svelte'
  import RedactionProbe from './RedactionProbe.svelte'

  import type {
    Annotation,
    DocumentSource,
    EngineLoader,
    InkError,
    PdfAssets,
    RedactionPreview,
  } from '@inkbar/core'

  let {
    src,
    assets,
    engine,
    own,
    confirm,
    throwing = false,
    shown = true,
    controlled,
    disabled,
    swap,
    control,
  }: {
    src: DocumentSource
    assets: PdfAssets
    engine?: EngineLoader | undefined
    own?: 'child' | 'div' | 'children' | undefined
    confirm?: 'yes' | 'no' | 'dialog' | undefined
    throwing?: boolean
    shown?: boolean
    controlled?: 'bound' | 'late' | 'never' | 'change' | undefined
    disabled?: boolean | undefined
    swap?: DocumentSource | undefined
    control?: { release?: () => void } | undefined
  } = $props()

  const tools = allTools()
  let errors = $state.raw<string[]>([])
  let previews = $state.raw<number[]>([])
  let redacted = $state(0)
  let list = $state.raw<Annotation[]>([])
  let proposals = $state.raw<string[]>([])
  let swapped = $state.raw<DocumentSource | null>(null)
  /** Set by `onRedacted`: the next proposal is the redaction's. */
  let redactionNext = false

  const ask = (preview: RedactionPreview): Promise<boolean> => {
    previews = [...previews, preview.marks]
    return Promise.resolve(confirm === 'yes')
  }
  const redactionConfirm = $derived(
    confirm === 'dialog' ? undefined : confirm ? ask : (false as const)
  )
  function onError(e: InkError): void {
    const callback = e.details['callback']
    errors = [...errors, typeof callback === 'string' ? `${e.code}:${callback}` : e.code]
  }
  function onRedacted(): void {
    redacted += 1
    redactionNext = true
    if (swap) swapped = swap
    if (throwing) throw new Error('host failed')
  }
  /** The function binding's setter. */
  function answer(next: Annotation[]): void {
    proposals = [...proposals, next.map((a) => a.type).join(' ')]
    const held = redactionNext
    redactionNext = false
    if (!held) list = next
    else if (controlled === 'late' && control) control.release = () => (list = next)
    else if (controlled === 'change') list = []
  }
  /** The plain binding records each list it is handed, too. */
  function onAnnotationsChange(next: Annotation[]): void {
    if (controlled === 'bound')
      proposals = [...proposals, next.map((a) => a.type).join(' ')]
  }
  const source = $derived(swapped ?? src)
</script>

{#snippet content()}
  <InkToolbar>
    <InkToolButton tool="select-text" />
    <InkToolButton tool="redact-area" />
    <InkUndo />
    {#if own === 'child'}
      <InkApplyRedactions {disabled}>
        {#snippet child({ props })}
          <button {...props} class="host-apply">Mine</button>
        {/snippet}
      </InkApplyRedactions>
    {:else if own === 'div'}
      <InkApplyRedactions {disabled}>
        {#snippet child({ props })}
          <div {...props} role="button" class="host-apply">Mine</div>
        {/snippet}
      </InkApplyRedactions>
    {:else if own === 'children'}
      <InkApplyRedactions {disabled}>
        {#snippet children({ label, busy, disabled: off })}
          <span class="host-label" data-busy={String(busy)} data-disabled={String(off)}
            >{label}</span
          >
        {/snippet}
      </InkApplyRedactions>
    {:else}
      <InkApplyRedactions />
    {/if}
    <InkDownloadButton />
    <InkPrintButton />
  </InkToolbar>
  <!-- Test-only box: the scroll container needs a bounded height. -->
  <div style="height: 400px; width: 600px"><InkViewport /></div>
  <RedactionProbe />
  <InkThreadPopover />
  <ActivateHook />
{/snippet}

<div>
  {#if !shown}
    <!-- unmounted -->
  {:else if controlled === 'bound'}
    <InkRoot
      bind:annotations={list}
      history={true}
      src={source}
      {assets}
      zoom={1}
      {tools}
      {engine}
      {redactionConfirm}
      {onError}
      {onRedacted}
      {onAnnotationsChange}
    >
      {@render content()}
    </InkRoot>
  {:else if controlled}
    <InkRoot
      bind:annotations={() => list, answer}
      history={true}
      src={source}
      {assets}
      zoom={1}
      {tools}
      {engine}
      {redactionConfirm}
      {onError}
      {onRedacted}
    >
      {@render content()}
    </InkRoot>
  {:else}
    <InkRoot
      src={source}
      {assets}
      zoom={1}
      {tools}
      {engine}
      {redactionConfirm}
      {onError}
      {onRedacted}
    >
      {@render content()}
    </InkRoot>
  {/if}
  <output data-testid="errors">{errors.join(' ')}</output>
  <output data-testid="previews">{previews.join(' ')}</output>
  <output data-testid="redacted">{redacted}</output>
  <output data-testid="proposals">{proposals.join('|')}</output>
  <output data-testid="list">{list.map((a) => a.type).join(' ')}</output>
</div>
