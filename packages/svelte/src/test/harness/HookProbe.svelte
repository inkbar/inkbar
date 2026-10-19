<script lang="ts">
  import { useAnnotations } from '../../lib/hooks/useAnnotations.svelte.js'
  import { useDocument } from '../../lib/hooks/useDocument.svelte.js'
  import { useEmbedded } from '../../lib/hooks/useEmbedded.svelte.js'
  import { useHistory } from '../../lib/hooks/useHistory.svelte.js'
  import { usePage } from '../../lib/hooks/usePage.svelte.js'
  import { useSelection } from '../../lib/hooks/useSelection.svelte.js'
  import { useTool } from '../../lib/hooks/useTool.svelte.js'
  import { useZoom } from '../../lib/hooks/useZoom.svelte.js'

  // Everything is read through the hook objects in the template, so a hook that returned plain
  // values instead of getters would freeze the probe (Review Focus 1).
  const doc = useDocument()
  const annotations = useAnnotations()
  const selection = useSelection()
  const embedded = useEmbedded()
  const history = useHistory()
  const page = usePage()
  const tool = useTool()
  const zoom = useZoom()
  const addNote = () =>
    annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 0, y: 0, width: 20, height: 20 },
    })
  const addBatch = (n: number) =>
    history.batch(() => {
      for (let i = 0; i < n; i++) addNote()
    })
</script>

<div
  data-testid="probe"
  data-ready={String(doc.isReady)}
  data-pages={doc.pages.length}
  data-count={page.count}
  data-current={page.current}
  data-annotations={annotations.annotations.length}
  data-selection={selection.selection.join(',')}
  data-embedded={embedded.total}
  data-can-undo={String(history.canUndo)}
  data-can-redo={String(history.canRedo)}
  data-tool={tool.tool}
  data-zoom={String(zoom.zoom)}
>
  <button data-testid="add" onclick={addNote}>add</button>
  <button data-testid="batch3" onclick={() => addBatch(3)}>batch3</button>
  <button data-testid="batch9" onclick={() => addBatch(9)}>batch9</button>
  <button data-testid="undo" onclick={() => history.undo()}>undo</button>
  <button data-testid="redo" onclick={() => history.redo()}>redo</button>
  <button
    data-testid="select"
    onclick={() => selection.select(annotations.annotations.map((a) => a.id))}
  >
    select
  </button>
  <button data-testid="previous" onclick={() => page.previous()}>previous</button>
  <button data-testid="next" onclick={() => page.next()}>next</button>
  <button data-testid="highlight" onclick={() => tool.setTool('highlight')}
    >highlight</button
  >
</div>
