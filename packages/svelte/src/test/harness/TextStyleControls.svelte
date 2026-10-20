<script lang="ts">
  // Adds a text box or a square and selects it, so the menu has something to style.
  import { useAnnotations } from '../../lib/hooks/useAnnotations.svelte.js'
  import { useSelection } from '../../lib/hooks/useSelection.svelte.js'
  import { useTool } from '../../lib/hooks/useTool.svelte.js'
  import { useToolStyle } from '../../lib/hooks/useToolStyle.svelte.js'

  const store = useAnnotations()
  const selection = useSelection()
  const tool = useTool()
  const style = useToolStyle()

  const boxStyle = $derived.by(() => {
    const box = store.annotations.find((a) => a.type === 'freetext')
    return box && box.type === 'freetext' ? JSON.stringify(box.defaultStyle) : ''
  })
  // `get` is not reactive; `current` changes whenever the group does.
  const group = $derived.by(() => {
    void style.current
    return JSON.stringify(style.get('text'))
  })
</script>

<div data-testid="probe" data-style={boxStyle} data-group={group}>
  <button
    data-testid="add-box"
    onclick={() =>
      store.add({
        type: 'freetext',
        page: 0,
        rect: { x: 50, y: 500, width: 200, height: 40 },
        contents: 'Hello',
        defaultStyle: {
          fontFamily: 'Helvetica',
          fontSize: 12,
          color: '#000000',
          textAlign: 'left',
        },
      })}
  >
    box
  </button>
  <button
    data-testid="add-square"
    onclick={() =>
      store.add({
        type: 'square',
        page: 0,
        rect: { x: 50, y: 400, width: 100, height: 60 },
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
  <button data-testid="tool-select" onclick={() => tool.setTool('select')}
    >select tool</button
  >
  <button data-testid="tool-freetext" onclick={() => tool.setTool('freetext')}
    >text tool</button
  >
</div>
