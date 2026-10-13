<script lang="ts">
  import { portal } from '../../lib/components/portal.js'

  /** Content portalled into `into`, with a control for everything that can change around it. */
  let { into, other }: { into: Element; other: Element } = $props()

  let shown = $state(true)
  let late = $state(false)
  let ticks = $state(0)
  let swapped = $state(false)
  // Rebuilt on every tick, the way InkPage's target entries are when an annotation changes:
  // the attach expression is evaluated again with the element it already had.
  const entry = $derived({ el: swapped ? other : into, ticks })
</script>

<button type="button" data-testid="tick" onclick={() => (ticks += 1)}>Tick</button>
<button type="button" data-testid="late" onclick={() => (late = true)}>Late</button>
<button type="button" data-testid="swap" onclick={() => (swapped = true)}>Swap</button>
<button type="button" data-testid="hide" onclick={() => (shown = false)}>Hide</button>
{#if shown}
  <div hidden data-testid="wrapper" {@attach portal(entry.el)}>
    <span class="first">first {entry.ticks}</span>
    {#if late}
      <span class="late">late</span>
    {/if}
    <span class="last">last</span>
  </div>
{/if}
