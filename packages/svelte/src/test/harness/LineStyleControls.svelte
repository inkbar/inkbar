<script lang="ts">
  // Adds lines and a square and selects them, so the menu has something to style.
  import { useAnnotations } from '../../lib/hooks/useAnnotations.svelte.js'
  import { useSelection } from '../../lib/hooks/useSelection.svelte.js'

  const store = useAnnotations()
  const selection = useSelection()

  const line = (width: number, y: number) =>
    store.add({ type: 'line', page: 0, start: { x: 50, y }, end: { x: 150, y }, width })
  const widths = $derived(
    store.annotations.map((a) => ('width' in a ? a.width : '')).join(',')
  )
  const dashes = $derived(
    store.annotations
      .map((a) => ('dashes' in a && a.dashes ? a.dashes.join('/') : '-'))
      .join(',')
  )
  const tails = $derived(
    store.annotations.map((a) => ('tail' in a && a.tail ? a.tail : '-')).join(',')
  )
</script>

<div data-testid="probe" data-widths={widths} data-dashes={dashes} data-tails={tails}>
  <button data-testid="add-line-1" onclick={() => line(1, 700)}>line 1</button>
  <button data-testid="add-line-3" onclick={() => line(3, 650)}>line 3</button>
  <button
    data-testid="add-square"
    onclick={() =>
      store.add({
        type: 'square',
        page: 0,
        rect: { x: 50, y: 500, width: 100, height: 60 },
      })}
  >
    square
  </button>
  <button
    data-testid="select-all"
    onclick={() => selection.select(store.annotations.map((a) => a.id))}
  >
    select all
  </button>
  <button data-testid="select-none" onclick={() => selection.select([])}
    >select none</button
  >
</div>
