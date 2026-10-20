import { InkColorMenu } from '../../src/components/InkColorMenu'
import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkViewport } from '../../src/components/InkViewport'
import { useAnnotations } from '../../src/hooks/useAnnotations'
import { useSelection } from '../../src/hooks/useSelection'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

/** Adds a square or a line and selects it, so the menus have something to colour. */
function Controls() {
  const { annotations, add } = useAnnotations()
  const { select } = useSelection()
  return (
    <div
      data-testid="probe"
      data-colors={annotations.map((a) => ('color' in a ? a.color : '-')).join(',')}
      data-fills={annotations
        .map((a) => ('interiorColor' in a && a.interiorColor ? a.interiorColor : '-'))
        .join(',')}
    >
      <button
        data-testid="add-square"
        onClick={() =>
          add({
            type: 'square',
            page: 0,
            rect: { x: 50, y: 500, width: 100, height: 60 },
            color: '#FF3B30',
            interiorColor: '#34C759',
          })
        }
      >
        square
      </button>
      <button
        data-testid="add-square-2"
        onClick={() =>
          add({
            type: 'square',
            page: 0,
            rect: { x: 200, y: 500, width: 100, height: 60 },
            color: '#007AFF',
            interiorColor: '#FF9500',
          })
        }
      >
        square 2
      </button>
      <button
        data-testid="add-line"
        onClick={() =>
          add({
            type: 'line',
            page: 0,
            start: { x: 50, y: 700 },
            end: { x: 150, y: 700 },
          })
        }
      >
        line
      </button>
      <button
        data-testid="select-all"
        onClick={() => select(annotations.map((a) => a.id))}
      >
        select all
      </button>
    </div>
  )
}

export function ColorMenuHarness({
  src,
  assets,
  disabled,
}: {
  src: DocumentSource
  assets: PdfAssets
  /** Passed to the border trigger as a host would. */
  disabled?: boolean
}) {
  return (
    <InkRoot src={src} assets={assets} zoom={1}>
      <InkToolbar>
        <InkColorMenu property="border" disabled={disabled} />
        <InkColorMenu property="fill" />
        <InkColorMenu property="textColor" />
      </InkToolbar>
      <div style={{ height: 600, width: 900 }}>
        <InkViewport />
      </div>
      <Controls />
    </InkRoot>
  )
}
