import { useEffect, useState } from 'react'

import { InkNotePopover } from '../../src/components/InkNotePopover'
import { InkRoot } from '../../src/components/InkRoot'
import { InkSuggestionCard } from '../../src/components/InkSuggestionCard'
import { InkViewport } from '../../src/components/InkViewport'

import type { Annotation, DocumentSource, InkDocument, PdfAssets } from '@inkbar/core'
import type { ToolId } from '@inkbar/core/dom'

export interface PopoverHarnessProps {
  src: DocumentSource
  assets: PdfAssets
  seedSuggestions?: boolean | undefined
  /** The host owns the list. */
  controlled?: boolean | undefined
  /** Controlled only: apply each proposal this many ms late, like a slow host. */
  applyDelay?: number | undefined
  /** Fill annotation elements with host content (a button). */
  customAnnotations?: boolean | undefined
  /** Replace the card's default content with one render-prop Remove button. */
  customCard?: boolean | undefined
  /** Replace the note popover's default content with one render-prop Remove button. */
  customNote?: boolean | undefined
  tool?: ToolId | undefined
}

type HostWindow = Window & { __inkHostRemove?: ((id: string) => void) | undefined }

export function PopoverHarness(props: PopoverHarnessProps) {
  const [list, setList] = useState<Annotation[]>([])
  const delay = props.applyDelay
  function onAnnotationsChange(next: Annotation[]): void {
    // InkRoot flushes proposals made outside a React event itself, so an immediate host
    // needs no flush here.
    if (delay === undefined) setList(next)
    else setTimeout(() => setList(next), delay)
  }
  // Test-only: the host drops an annotation from its own list, outside any popover.
  useEffect(() => {
    ;(window as HostWindow).__inkHostRemove = (id) =>
      setList((l) => l.filter((a) => a.id !== id))
    return () => {
      ;(window as HostWindow).__inkHostRemove = undefined
    }
  }, [])
  function onReady(doc: InkDocument): void {
    if (!props.seedSuggestions) return
    doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 72, y: 670, width: 150, height: 20 },
      origin: 'suggested',
      suggestion: {
        confidence: 0.92,
        reason: 'third-party name',
        explanation: 'Names a person other than the data subject.',
      },
    })
    doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 72, y: 640, width: 150, height: 20 },
      origin: 'suggested',
      suggestion: { confidence: 0.3, reason: 'possible email' },
    })
  }
  return (
    <InkRoot
      src={props.src}
      assets={props.assets}
      zoom={1}
      tool={props.tool}
      annotations={props.controlled ? list : undefined}
      onAnnotationsChange={onAnnotationsChange}
      onReady={onReady}
    >
      {/* Test-only box: the scroll container needs a bounded height to scroll. */}
      <div style={{ height: 600, width: 900 }}>
        <InkViewport
          renderAnnotation={
            props.customAnnotations
              ? ({ annotation }) => (
                  <button type="button" data-testid="pin">
                    Pin {annotation.type}
                  </button>
                )
              : undefined
          }
        />
      </div>
      {props.customNote ? (
        <InkNotePopover>
          {({ remove }) => (
            <button type="button" data-testid="custom-remove" onClick={remove}>
              Remove
            </button>
          )}
        </InkNotePopover>
      ) : (
        <InkNotePopover />
      )}
      {props.customCard ? (
        <InkSuggestionCard>
          {({ dismiss }) => (
            <button type="button" data-testid="custom-dismiss" onClick={dismiss}>
              Remove
            </button>
          )}
        </InkSuggestionCard>
      ) : (
        <InkSuggestionCard />
      )}
    </InkRoot>
  )
}
