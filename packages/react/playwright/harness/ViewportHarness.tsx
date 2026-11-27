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
  pinchZoom?: boolean | undefined
  customAnnotations?: boolean | undefined
  customLoading?: boolean | undefined
  passwordPrompt?: boolean | undefined
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
  // Stands in for a page the engine cannot render: the canvas draws through the reader's `draw`
  // and the text layer reads through its `text`, so failing them fails that page's mount and
  // nothing else.
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
    const reader = doc._reader
    const draw = reader.draw.bind(reader)
    reader.draw = async (request, ...rest) => {
      if (failing.current && request.page === target)
        throw new Error('The page could not be drawn by the engine')
      return draw(request, ...rest)
    }
    const text = reader.text.bind(reader)
    reader.text = async (page, ...rest) => {
      if (failing.current && page === target)
        throw new Error('The page could not be drawn by the engine')
      // Only the text layer reads text here: failing the read fails that layer alone.
      if (page === textTarget) throw new Error('No text from the engine')
      return text(page, ...rest)
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
        passwordPrompt={props.passwordPrompt}
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
            // Left unset unless a test passes it, so the component's own default applies.
            {...(props.pinchZoom === undefined ? {} : { pinchZoom: props.pinchZoom })}
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
