<script lang="ts">
  /* A sidebar of three panels, with no viewer. The Search panel holds a field and can be removed. */
  import { MessageSquare, Search, Square } from '@inkbar/icons'
  import { untrack } from 'svelte'

  import InkPanel from '../../lib/components/InkPanel.svelte'
  import InkSidebar from '../../lib/components/InkSidebar.svelte'

  import type { SidebarLayout, SidebarOpen, SidebarSide } from '@inkbar/core/dom'

  let {
    layout,
    side,
    open: initial,
  }: {
    layout?: SidebarLayout | undefined
    side?: SidebarSide | undefined
    /** `bind:open` to a value starting at this; leave it out for an uncontrolled sidebar. */
    open?: SidebarOpen | undefined
  } = $props()

  const controlled = untrack(() => initial !== undefined)
  let open = $state<SidebarOpen | undefined>(untrack(() => initial))
  let withSearch = $state(true)
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
<button type="button" data-testid="clear-badge" onclick={() => (badge = 0)}>
  Clear badge
</button>
<output data-testid="open">{JSON.stringify(open ?? null)}</output>
<div style="display: flex; height: 400px">
  {#if controlled}
    <InkSidebar bind:open {layout} {side} data-testid="sidebar">
      <InkPanel id="pages" label="Pages" icon={Square}><p>Pages content</p></InkPanel>
      {#if withSearch}
        <InkPanel id="search" label="Search" icon={Search} {badge}>
          <input aria-label="Query" />
        </InkPanel>
      {/if}
      <InkPanel id="notes" label="Notes" icon={MessageSquare}>
        <p>Notes content</p>
      </InkPanel>
    </InkSidebar>
  {:else}
    <InkSidebar {layout} {side} data-testid="sidebar">
      <InkPanel id="pages" label="Pages" icon={Square}><p>Pages content</p></InkPanel>
      {#if withSearch}
        <InkPanel id="search" label="Search" icon={Search} {badge}>
          <input aria-label="Query" />
        </InkPanel>
      {/if}
      <InkPanel id="notes" label="Notes" icon={MessageSquare}>
        <p>Notes content</p>
      </InkPanel>
    </InkSidebar>
  {/if}
</div>
