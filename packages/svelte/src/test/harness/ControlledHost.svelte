<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'

  import AddOnReady from './AddOnReady.svelte'
  import HookProbe from './HookProbe.svelte'

  import type { Annotation, PdfAssets } from '@inkbar/core'

  /** A host that owns the list, the way an app would, through a function binding that applies at once. */
  let {
    src,
    assets,
    history,
    addOnReady = false,
    spreadOnRender = false,
  }: {
    src: string
    assets: PdfAssets
    history?: boolean | undefined
    /** Add one note from an effect once the document is ready. */
    addOnReady?: boolean
    /** Hand InkRoot a new array with the same content every time the binding is read. */
    spreadOnRender?: boolean
  } = $props()

  let list = $state.raw<Annotation[]>([])
  let bumps = $state(0)
  // A fresh array per read: the snapshot history must record no step for it (the React plan's
  // Review Focus 2), and `bumps` makes InkRoot read it again.
  const bound = $derived.by(() => {
    if (!spreadOnRender) return list
    void bumps
    return [...list]
  })
</script>

<InkRoot
  {src}
  {assets}
  bind:annotations={() => bound, (next: Annotation[]) => (list = next)}
  {history}
>
  <HookProbe />
  {#if addOnReady}<AddOnReady />{/if}
  <output data-testid="host-count">{list.length}</output>
  <button type="button" data-testid="bump" onclick={() => (bumps += 1)}>{bumps}</button>
</InkRoot>
