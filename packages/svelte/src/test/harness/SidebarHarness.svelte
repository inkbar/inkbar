<script lang="ts">
  /*
   * A sidebar of three panels. The Search panel holds a field and can be removed. With `stored`,
   * the sidebar keeps its width in a store the page shows; with `inRoot`, that store is
   * InkRoot's and the sidebar inherits it. The store outlives a remount.
   */
  import { MessageSquare, Search, Square } from '@inkbar/icons'
  import { untrack } from 'svelte'

  import InkPanel from '../../lib/components/InkPanel.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSidebar from '../../lib/components/InkSidebar.svelte'

  import SignatureStorageProbe from './SignatureStorageProbe.svelte'

  import type { InkStorage, PdfAssets } from '@inkbar/core'
  import type { SidebarLayout, SidebarOpen, SidebarSide } from '@inkbar/core/dom'

  let {
    layout,
    side,
    open: initial,
    width: initialWidth,
    bindWidth = false,
    stored,
    inRoot = false,
    assets,
  }: {
    layout?: SidebarLayout | undefined
    side?: SidebarSide | undefined
    /** `bind:open` to a value starting at this; leave it out for an uncontrolled sidebar. */
    open?: SidebarOpen | undefined
    /** `bind:width` to a value starting at this (a number controls it). */
    width?: number | undefined
    /** `bind:width` to a value starting undefined: reports, but stays uncontrolled. */
    bindWidth?: boolean
    /** The store's starting values. Leave it out for a sidebar with no store. */
    stored?: Record<string, unknown> | undefined
    /** Put the sidebar in an InkRoot that owns the store; needs `assets`. */
    inRoot?: boolean
    assets?: PdfAssets | undefined
  } = $props()

  const controlled = untrack(() => initial !== undefined)
  let open = $state<SidebarOpen | undefined>(untrack(() => initial))
  let width = $state<number | undefined>(untrack(() => initialWidth))
  const widthBound = untrack(() => initialWidth !== undefined || bindWidth)
  /** A store whose contents the page shows. */
  let saved = $state<Record<string, unknown>>(untrack(() => ({ ...stored })))
  const storage: InkStorage | undefined = untrack(() =>
    stored
      ? {
          get: (key) => saved[key],
          set(key, value) {
            saved = { ...saved, [key]: value }
          },
          remove(key) {
            const next = { ...saved }
            delete next[key]
            saved = next
          },
        }
      : undefined
  )
  let withSearch = $state(true)
  let withSidebar = $state(true)
  let badge = $state(3)
</script>

<button
  type="button"
  data-testid="toggle-search"
  onclick={() => (withSearch = !withSearch)}
>
  Toggle search
</button>
<button
  type="button"
  data-testid="open-notes"
  onclick={() => (open = layout === 'stack' ? ['notes'] : 'notes')}
>
  Open notes
</button>
<button
  type="button"
  data-testid="toggle-sidebar"
  onclick={() => (withSidebar = !withSidebar)}
>
  Toggle sidebar
</button>
<button type="button" data-testid="clear-badge" onclick={() => (badge = 0)}>
  Clear badge
</button>
<output data-testid="open">{JSON.stringify(open ?? null)}</output>
<button type="button" data-testid="remount" onclick={() => (withSidebar = !withSidebar)}>
  Remount
</button>
<button type="button" data-testid="clear-width" onclick={() => (width = undefined)}>
  Clear width
</button>
<output data-testid="width">{JSON.stringify(width ?? null)}</output>
<output data-testid="stored">{JSON.stringify(saved)}</output>

{#snippet panels()}
  <InkPanel id="pages" label="Pages" icon={Square}><p>Pages content</p></InkPanel>
  {#if withSearch}
    <InkPanel id="search" label="Search" icon={Search} {badge}>
      <input aria-label="Query" />
    </InkPanel>
  {/if}
  <InkPanel id="notes" label="Notes" icon={MessageSquare}>
    <p>Notes content</p>
  </InkPanel>
{/snippet}

{#snippet sidebar()}
  <div style="display: flex; height: 400px">
    {#if !withSidebar}
      <!-- The whole sidebar out. -->
    {:else if controlled && widthBound}
      <InkSidebar
        bind:open
        bind:width
        {layout}
        {side}
        storage={inRoot ? undefined : storage}
        data-testid="sidebar"
      >
        {@render panels()}
      </InkSidebar>
    {:else if controlled}
      <InkSidebar
        bind:open
        {layout}
        {side}
        storage={inRoot ? undefined : storage}
        data-testid="sidebar"
      >
        {@render panels()}
      </InkSidebar>
    {:else if widthBound}
      <InkSidebar
        bind:width
        {layout}
        {side}
        storage={inRoot ? undefined : storage}
        data-testid="sidebar"
      >
        {@render panels()}
      </InkSidebar>
    {:else}
      <InkSidebar
        {layout}
        {side}
        storage={inRoot ? undefined : storage}
        data-testid="sidebar"
      >
        {@render panels()}
      </InkSidebar>
    {/if}
  </div>
{/snippet}

{#if inRoot}
  <InkRoot src={null} assets={assets!} {storage}>
    <SignatureStorageProbe />
    {@render sidebar()}
  </InkRoot>
{:else}
  {@render sidebar()}
{/if}
