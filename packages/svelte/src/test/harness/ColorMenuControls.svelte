<script lang="ts">
  // Adds a square or a line and selects it, so the menus have something to colour.
  import { useAnnotations } from '../../lib/hooks/useAnnotations.svelte.js'
  import { useSelection } from '../../lib/hooks/useSelection.svelte.js'

  const store = useAnnotations()
  const selection = useSelection()

  const colors = $derived(
    store.annotations.map((a) => ('color' in a ? a.color : '-')).join(',')
  )
  const fills = $derived(
    store.annotations
      .map((a) => ('interiorColor' in a && a.interiorColor ? a.interiorColor : '-'))
      .join(',')
  )
</script>

<div data-testid="probe" data-colors={colors} data-fills={fills}>
  <button
    data-testid="add-square"
    onclick={() =>
      store.add({
        type: 'square',
        page: 0,
        rect: { x: 50, y: 500, width: 100, height: 60 },
        color: '#FF3B30',
        interiorColor: '#34C759',
      })}
  >
    square
  </button>
  <button
    data-testid="add-line"
    onclick={() =>
      store.add({
        type: 'line',
        page: 0,
        start: { x: 50, y: 700 },
        end: { x: 150, y: 700 },
      })}
  >
    line
  </button>
  <button
    data-testid="select-all"
    onclick={() => selection.select(store.annotations.map((a) => a.id))}
  >
    select all
  </button>
</div>
