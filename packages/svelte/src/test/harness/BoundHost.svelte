<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'

  import HookProbe from './HookProbe.svelte'

  import type { InkHistory } from '../../lib/context.js'
  import type {
    Annotation,
    AnnotationChange,
    InkDocument,
    InkStatus,
    PdfAssets,
  } from '@inkbar/core'

  /**
   * A host on the binding paths: `bind:annotations` by default; with `withhold`, a function
   * binding whose setter records the proposal and applies it only when Apply is pressed.
   * With `noteColor`, the root element sets the theme's note colour variable to it.
   */
  let {
    src,
    assets,
    withhold = false,
    asChild = false,
    history,
    noteColor,
    onProposal,
    onChange,
  }: {
    src: string
    assets: PdfAssets
    withhold?: boolean
    asChild?: boolean
    history?: boolean | undefined
    noteColor?: string | undefined
    onProposal?: ((next: Annotation[]) => void) | undefined
    onChange?: ((kind: string) => void) | undefined
  } = $props()

  let list = $state.raw<Annotation[]>([])
  let pending = $state.raw<Annotation[] | null>(null)
  // The linter's type program resolves a `.svelte` import to `any`, so the instance exports and
  // callback parameters are spelled out here; svelte-check holds them against the real component.
  interface RootHandle {
    history: InkHistory
    getDocument(): InkDocument | null
    getStatus(): InkStatus
  }
  let root = $state<RootHandle | undefined>(undefined)
  let rootEl = $state<HTMLElement | null>(null)
  const themeStyle = $derived(noteColor ? `--ink-note: ${noteColor}` : undefined)

  function propose(next: Annotation[]): void {
    onProposal?.(next)
    if (withhold) pending = next
    else list = next
  }
</script>

{#snippet probeAndHandle()}
  <HookProbe />
  <output data-testid="host-count">{list.length}</output>
  <button type="button" data-testid="apply" onclick={() => pending && (list = pending)}>
    apply
  </button>
  <button type="button" data-testid="clear-history" onclick={() => root?.history.clear()}>
    clear
  </button>
  <output data-testid="handle-can-undo">{String(root?.history.canUndo ?? false)}</output>
  <output data-testid="handle-status">{root?.getStatus().state}</output>
  <output data-testid="handle-has-document"
    >{String(root ? root.getDocument() !== null : false)}</output
  >
  <output data-testid="handle-ref"
    >{rootEl?.hasAttribute('data-ink-root') ? 'data-ink-root' : ''}</output
  >
{/snippet}

{#if asChild}
  <InkRoot
    bind:this={root}
    bind:ref={rootEl}
    {src}
    {assets}
    bind:annotations={() => list, propose}
    {history}
    onChange={(c: AnnotationChange) => onChange?.(c.kind)}
  >
    {#snippet child({ props })}
      <section {...props} class="host-root" style={themeStyle}>
        {@render probeAndHandle()}
      </section>
    {/snippet}
  </InkRoot>
{:else}
  <InkRoot
    bind:this={root}
    bind:ref={rootEl}
    {src}
    {assets}
    bind:annotations={() => list, propose}
    {history}
    style={themeStyle}
    onChange={(c: AnnotationChange) => onChange?.(c.kind)}
  >
    {@render probeAndHandle()}
  </InkRoot>
{/if}
