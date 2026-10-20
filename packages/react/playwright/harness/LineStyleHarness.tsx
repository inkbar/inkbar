import { InkLineStyleMenu } from '../../src/components/InkLineStyleMenu'
import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkViewport } from '../../src/components/InkViewport'
import { useAnnotations } from '../../src/hooks/useAnnotations'
import { useSelection } from '../../src/hooks/useSelection'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

const rect = { x: 50, y: 500, width: 100, height: 60 }

/** Adds lines and a square and selects them, so the menu has something to style. */
function Controls() {
  const { annotations, add } = useAnnotations()
  const { select } = useSelection()
  const line = (width: number, y: number) =>
    add({
      type: 'line',
      page: 0,
      start: { x: 50, y },
      end: { x: 150, y },
      width,
    })
  return (
    <div
      data-testid="probe"
      data-widths={annotations.map((a) => ('width' in a ? a.width : '')).join(',')}
      data-dashes={annotations
        .map((a) => ('dashes' in a && a.dashes ? a.dashes.join('/') : '-'))
        .join(',')}
      data-tails={annotations
        .map((a) => ('tail' in a && a.tail ? a.tail : '-'))
        .join(',')}
    >
      <button data-testid="add-line-1" onClick={() => line(1, 700)}>
        line 1
      </button>
      <button data-testid="add-line-3" onClick={() => line(3, 650)}>
        line 3
      </button>
      <button
        data-testid="add-square"
        onClick={() => add({ type: 'square', page: 0, rect })}
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
      <button
        data-testid="select-first"
        onClick={() => select(annotations.slice(0, 1).map((a) => a.id))}
      >
        select first
      </button>
    </div>
  )
}

export function LineStyleHarness({
  src,
  assets,
  disabled,
}: {
  src: DocumentSource
  assets: PdfAssets
  /** Passed to the trigger as a host would. */
  disabled?: boolean
}) {
  return (
    <InkRoot src={src} assets={assets} zoom={1}>
      <InkToolbar>
        <InkLineStyleMenu disabled={disabled} />
      </InkToolbar>
      <div style={{ height: 600, width: 900 }}>
        <InkViewport />
      </div>
      <Controls />
    </InkRoot>
  )
}
