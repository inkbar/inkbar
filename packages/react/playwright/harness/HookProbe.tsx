import { useAnnotations } from '../../src/hooks/useAnnotations'
import { useDocument } from '../../src/hooks/useDocument'
import { useEmbedded } from '../../src/hooks/useEmbedded'
import { useHistory } from '../../src/hooks/useHistory'
import { usePage } from '../../src/hooks/usePage'
import { useSelection } from '../../src/hooks/useSelection'
import { useTool } from '../../src/hooks/useTool'
import { useZoom } from '../../src/hooks/useZoom'

export function HookProbe() {
  const { isReady, pages } = useDocument()
  const { annotations, add } = useAnnotations()
  const { selection, select } = useSelection()
  const { total } = useEmbedded()
  const { canUndo, canRedo, undo, redo } = useHistory()
  const { count, current } = usePage()
  const { tool, setTool } = useTool()
  const { zoom } = useZoom()
  const addNote = () =>
    add({ type: 'note', page: 0, rect: { x: 0, y: 0, width: 20, height: 20 } })
  return (
    <div
      data-testid="probe"
      data-ready={String(isReady)}
      data-pages={pages.length}
      data-count={count}
      data-current={current}
      data-annotations={annotations.length}
      data-selection={selection.join(',')}
      data-embedded={total}
      data-can-undo={String(canUndo)}
      data-can-redo={String(canRedo)}
      data-tool={tool}
      data-zoom={String(zoom)}
    >
      <button data-testid="add" onClick={addNote}>
        add
      </button>
      <button data-testid="undo" onClick={undo}>
        undo
      </button>
      <button data-testid="redo" onClick={redo}>
        redo
      </button>
      <button data-testid="select" onClick={() => select(annotations.map((a) => a.id))}>
        select
      </button>
      <button data-testid="highlight" onClick={() => setTool('highlight')}>
        highlight
      </button>
    </div>
  )
}
