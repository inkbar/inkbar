import { InkRoot } from '../../src/components/InkRoot'
import { InkTextStyleMenu } from '../../src/components/InkTextStyleMenu'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkViewport } from '../../src/components/InkViewport'
import { useAnnotations } from '../../src/hooks/useAnnotations'
import { useSelection } from '../../src/hooks/useSelection'
import { useTool } from '../../src/hooks/useTool'
import { useToolStyle } from '../../src/hooks/useToolStyle'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

/** Adds a text box or a square and selects it, so the menu has something to style. */
function Controls() {
  const { annotations, add } = useAnnotations()
  const { selection, select } = useSelection()
  const { setTool } = useTool()
  const style = useToolStyle()
  const box = annotations.find((a) => a.type === 'freetext')
  return (
    <div
      data-testid="probe"
      data-style={box && box.type === 'freetext' ? JSON.stringify(box.defaultStyle) : ''}
      data-group={JSON.stringify(style.get('text'))}
      data-selected={selection
        .map((id) => annotations.find((a) => a.id === id)?.type)
        .join(' ')}
    >
      <button
        data-testid="add-box"
        onClick={() =>
          add({
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
          })
        }
      >
        box
      </button>
      <button
        data-testid="add-square"
        onClick={() =>
          add({
            type: 'square',
            page: 0,
            rect: { x: 50, y: 400, width: 100, height: 60 },
          })
        }
      >
        square
      </button>
      <button
        data-testid="select-all"
        onClick={() => select(annotations.map((a) => a.id))}
      >
        select all
      </button>
      <button data-testid="select-none" onClick={() => select([])}>
        select none
      </button>
      <button data-testid="tool-select" onClick={() => setTool('select')}>
        select tool
      </button>
      <button data-testid="tool-freetext" onClick={() => setTool('freetext')}>
        text tool
      </button>
      <button data-testid="tool-shape" onClick={() => setTool('shape')}>
        shape tool
      </button>
    </div>
  )
}

export function TextStyleHarness({
  src,
  assets,
  fonts,
}: {
  src: DocumentSource
  assets: PdfAssets
  fonts?: string[] | undefined
}) {
  return (
    <InkRoot src={src} assets={assets} zoom={1} fonts={fonts}>
      <InkToolbar>
        <InkTextStyleMenu />
      </InkToolbar>
      <div style={{ height: 600, width: 900 }}>
        <InkViewport />
      </div>
      <Controls />
    </InkRoot>
  )
}
