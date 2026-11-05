/*
 * A thumbnail list beside the viewport, and a dialog holding one thumbnail, as a "Remove pages"
 * dialog would.
 */
import { useRef, useState } from 'react'

import { InkRoot } from '../../src/components/InkRoot'
import { InkThumbnail } from '../../src/components/InkThumbnail'
import { InkThumbnails } from '../../src/components/InkThumbnails'
import { InkViewport } from '../../src/components/InkViewport'
import { usePage } from '../../src/hooks/usePage'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

function PageProbe() {
  const { current } = usePage()
  return <output data-testid="current">{current}</output>
}

export function ThumbnailsHarness({
  src,
  assets,
  pages,
  width,
}: {
  src: DocumentSource | null
  assets: PdfAssets
  pages?: number[] | undefined
  width?: number | undefined
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [withList, setWithList] = useState(true)
  return (
    <InkRoot src={src} assets={assets} zoom={1}>
      <button
        type="button"
        data-testid="open-dialog"
        onClick={() => dialog.current?.showModal()}
      >
        Remove pages
      </button>
      <button
        type="button"
        data-testid="toggle-list"
        onClick={() => setWithList((w) => !w)}
      >
        Toggle list
      </button>
      <PageProbe />
      <div style={{ display: 'flex' }}>
        {/* Test-only box: the list fills its parent's height. */}
        <div style={{ height: 400, width: 200 }}>
          {withList ? (
            <InkThumbnails
              pages={pages}
              width={width}
              data-testid="list"
              renderItem={({ page, current }) => (
                <span
                  className="harness-item"
                  data-page={page}
                  data-current={String(current)}
                >
                  {current ? 'here' : ''}
                </span>
              )}
            />
          ) : null}
        </div>
        <div style={{ height: 450, width: 600 }}>
          <InkViewport />
        </div>
      </div>
      <dialog ref={dialog} aria-label="Remove pages">
        <InkThumbnail page={1} width={80} data-testid="dialog-thumbnail" />
        <button type="button" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </dialog>
    </InkRoot>
  )
}
