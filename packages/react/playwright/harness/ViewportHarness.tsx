import { useRef, useState } from 'react'

import { InkRoot } from '../../src/components/InkRoot'
import { InkViewport } from '../../src/components/InkViewport'

import type { Annotation, DocumentSource, InkDocument, PdfAssets } from '@inkbar/core'
import type { ToolId, ZoomValue } from '@inkbar/core/dom'

export interface ViewportHarnessProps {
  src: DocumentSource | null
  assets: PdfAssets
  zoom?: ZoomValue | undefined
  page?: number | undefined
  buffer?: number | undefined
  gap?: number | undefined
  customAnnotations?: boolean | undefined
  customLoading?: boolean | undefined
  tool?: ToolId | undefined
  /** Marks text annotations with `data-test-mark`; a function cannot cross the mount boundary. */
  decorateMark?: string | undefined
  /** Zero-based page whose page lookups reject until the Heal button is pressed. */
  failPage?: number | undefined
  /** Zero-based page whose text content fails to load (its canvas still renders). */
  failText?: number | undefined
  onZoomChange?: ((z: ZoomValue) => void) | undefined
  onPageChange?: ((p: number) => void) | undefined
}

export function ViewportHarness(props: ViewportHarnessProps) {
  const [clicks, setClicks] = useState(0)
  // Stands in for a page the engine cannot render: the canvas and text layer both look the
  // page up through `_pdfjs.getPage`, so failing it fails that page's mount and nothing else.
  const failing = useRef(true)
  const mark = props.decorateMark
  const decorate =
    mark === undefined
      ? undefined
      : (a: Annotation) =>
          a.type === 'text' ? { data: { 'test-mark': mark } } : undefined
  const heal = () => {
    failing.current = false
  }
  function onReady(doc: InkDocument): void {
    const target = props.failPage
    const textTarget = props.failText
    if (target === undefined && textTarget === undefined) return
    const handles = doc._pdfjs
    const original = handles.getPage.bind(handles)
    handles.getPage = async (index) => {
      if (failing.current && index === target)
        throw new Error('The page could not be drawn by the engine')
      const page = await original(index)
      // Only the text layer streams text content: failing the stream fails that layer alone.
      if (index === textTarget) {
        page.streamTextContent = () =>
          new ReadableStream({
            start: (controller) => controller.error(new Error('No text from the engine')),
          })
      }
      return page
    }
  }
  return (
    <div>
      <button type="button" data-testid="outside" onClick={() => setClicks((c) => c + 1)}>
        Outside {clicks}
      </button>
      <button type="button" data-testid="heal" onClick={heal}>
        Heal
      </button>
      <InkRoot
        src={props.src}
        assets={props.assets}
        zoom={props.zoom}
        page={props.page}
        tool={props.tool}
        decorateAnnotation={decorate}
        onZoomChange={props.onZoomChange}
        onPageChange={props.onPageChange}
        onReady={onReady}
      >
        {/* Test-only box: the scroll container needs a bounded height to scroll. */}
        <div style={{ height: 700, width: 900 }}>
          <InkViewport
            buffer={props.buffer ?? 2}
            gap={props.gap ?? 16}
            loading={
              props.customLoading ? (
                <span data-testid="custom-loading">Opening the file</span>
              ) : undefined
            }
            renderAnnotation={
              props.customAnnotations
                ? ({ annotation, state, locked, select, remove }) => (
                    <>
                      <span
                        className="my-pin"
                        data-type={annotation.type}
                        data-pin-state={state}
                        data-pin-locked={String(locked)}
                      >
                        Pin
                      </span>
                      {annotation.type === 'redact' ? (
                        <>
                          <button type="button" data-testid="select" onClick={select}>
                            Select
                          </button>
                          <button type="button" data-testid="remove" onClick={remove}>
                            Remove
                          </button>
                          <input data-testid="slot-input" aria-label="Comment" />
                        </>
                      ) : null}
                    </>
                  )
                : undefined
            }
          />
        </div>
      </InkRoot>
    </div>
  )
}
