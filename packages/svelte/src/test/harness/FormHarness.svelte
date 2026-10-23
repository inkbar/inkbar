<script module lang="ts">
  import type {
    FieldsChange,
    FieldValues,
    FormAction,
    InkError,
    PdfAssets,
    SignatureTemplate,
  } from '@inkbar/core'

  export interface FormHarnessProps {
    src: string
    assets: PdfAssets
    /** Puts the fields under the harness's control through `bind:fields`, starting from `initial`. */
    controlled?: boolean
    initial?: FieldValues
    /** What the Push button sets the bound value to. */
    push?: FieldValues
    /** What the Swap button opens next, and the bound values it starts from. */
    swapTo?: { src: string; initial?: FieldValues }
    templates?: SignatureTemplate[]
    formHighlight?: boolean
    onformaction?: (action: FormAction) => void
    onError?: (error: InkError) => void
    onChanged?: (next: FieldValues, change: FieldsChange) => void
  }
</script>

<script lang="ts">
  import { createMemorySignatureStore } from '@inkbar/core'
  import { untrack } from 'svelte'

  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkUndo from '../../lib/components/InkUndo.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import FormProbe from './FormProbe.svelte'
  import HookProbe from './HookProbe.svelte'

  /** A host that owns the values through `bind:fields`, the way an app would. */
  let {
    src: initialSrc,
    assets,
    controlled = false,
    initial = {},
    push = {},
    swapTo,
    templates = [],
    formHighlight,
    onformaction,
    onError,
    onChanged,
  }: FormHarnessProps = $props()

  let src = $state(untrack(() => initialSrc))
  let values = $state.raw<FieldValues | undefined>(
    untrack(() => (controlled ? initial : undefined))
  )
  let heard = $state(0)
  let gap = $state(16)
  const store = untrack(() => createMemorySignatureStore(templates))
</script>

<InkRoot
  {src}
  {assets}
  zoom={1}
  signatures={store}
  bind:fields={values}
  onFieldsChange={(next, change) => {
    heard += 1
    onChanged?.(next, change)
  }}
  {formHighlight}
  {onformaction}
  {onError}
>
  <InkToolbar>
    <InkUndo />
  </InkToolbar>
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px">
    <InkViewport {gap} />
  </div>
  <output
    data-testid="host-fields"
    data-values={JSON.stringify(values ?? {})}
    data-heard={heard}
  ></output>
  <button
    type="button"
    data-testid="push"
    onclick={() => (values = { ...values, ...push })}
  >
    push
  </button>
  <button
    type="button"
    data-testid="swap"
    onclick={() => {
      if (!swapTo) return
      src = swapTo.src
      if (controlled) values = swapTo.initial ?? {}
    }}
  >
    swap
  </button>
  <!-- A construction-only option: the engine rebuilds, and every page mounts afresh. -->
  <button type="button" data-testid="regap" onclick={() => (gap += 8)}>regap</button>
  <FormProbe />
  <HookProbe />
</InkRoot>
