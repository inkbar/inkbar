/*
 * An outline panel beside the viewport, with Back and Forward, the current page, and a button
 * that opens another document in the same root.
 */
import { useState } from 'react'

import { InkBack } from '../../src/components/InkBack'
import { InkForward } from '../../src/components/InkForward'
import { InkOutline } from '../../src/components/InkOutline'
import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkViewport } from '../../src/components/InkViewport'
import { usePage } from '../../src/hooks/usePage'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

function PageProbe() {
  const { current } = usePage()
  return <output data-testid="current">{current}</output>
}

export function OutlineHarness({
  src,
  otherSrc,
  assets,
  emptyText,
  slotted,
}: {
  src: DocumentSource | null
  /** What the "Open other" button switches to. */
  otherSrc?: DocumentSource | null
  assets: PdfAssets
  emptyText?: string | undefined
  slotted?: boolean
}) {
  const [source, setSource] = useState(src)
  return (
    <InkRoot src={source} assets={assets} zoom={1}>
      <InkToolbar>
        <InkBack data-testid="back" />
        <InkForward data-testid="forward" />
      </InkToolbar>
      <button
        type="button"
        data-testid="open-other"
        onClick={() => setSource(otherSrc ?? null)}
      >
        Open other
      </button>
      <button type="button" data-testid="open-first" onClick={() => setSource(src)}>
        Open first
      </button>
      <PageProbe />
      <div style={{ display: 'flex' }}>
        {/* Test-only box: the outline fills its parent's height. */}
        <div style={{ height: 450, width: 240 }}>
          <InkOutline
            data-testid="outline"
            emptyText={emptyText}
            renderItem={
              slotted
                ? (item, { current, expanded }) => (
                    <b
                      className="harness-title"
                      data-current={String(current)}
                      data-expanded={String(expanded)}
                    >
                      {item.title}
                    </b>
                  )
                : undefined
            }
          />
        </div>
        <div style={{ height: 450, width: 600 }}>
          <InkViewport />
        </div>
      </div>
    </InkRoot>
  )
}
