/*
 * One page the viewer engine mounted. Renders nothing in place; portals go into the host
 * (page error) and into each annotation's overlay element (custom annotations).
 *
 * The overlay creates and removes those elements as the annotation list changes, outside
 * React. So the portal targets come from a list read after every overlay render: this
 * component subscribes to the store after the overlay does (the engine created the mount
 * first), and core notifies subscribers in order, so the elements already exist when the list
 * arrives here.
 *
 * The engine tracks page errors and sets `data-state="error"` on the host; this component
 * portals the page-error slot into it while `error` is set.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useInkContext } from '../context'

import { InkAnnotation } from './InkAnnotation'

import type { Annotation, InkError } from '@inkbar/core'
import type { AnnotationSlotProps, PageMount } from '@inkbar/core/dom'

export interface InkPageProps {
  page: number
  host: HTMLElement
  /** The engine's page mount in `host`. */
  mount: PageMount
  /** The engine's error for this page, `null` while it renders. */
  error: InkError | null
  /** Fixed for the life of the mount: the engine rebuilds when it changes. */
  customAnnotations?: boolean
  renderAnnotation?: ((props: AnnotationSlotProps) => ReactNode) | undefined
  renderPageError?: ((props: { error: InkError; page: number }) => ReactNode) | undefined
}

interface Target {
  annotation: Annotation
  el: HTMLElement
}

function sameTargets(a: readonly Target[], b: readonly Target[]): boolean {
  return (
    a.length === b.length &&
    a.every((t, i) => t.annotation === b[i]!.annotation && t.el === b[i]!.el)
  )
}

export function InkPage({
  page,
  host,
  mount,
  error,
  customAnnotations = false,
  renderAnnotation,
  renderPageError,
}: InkPageProps) {
  const doc = useInkContext('InkPage').document
  const [targets, setTargets] = useState<Target[]>([])

  useEffect(() => {
    if (!doc || !customAnnotations) return
    const read = (): void => {
      const next = doc.annotations.byPage(page).flatMap((annotation) => {
        const el = mount.overlay.elementFor(annotation.id)
        return el ? [{ annotation, el }] : []
      })
      // A change elsewhere in the document leaves this page's targets as they were.
      setTargets((prev) => (sameTargets(prev, next) ? prev : next))
    }
    const stop = doc.annotations.list.subscribe(read)
    read()
    return () => {
      stop()
      setTargets([])
    }
  }, [doc, page, mount, customAnnotations])

  return (
    <>
      {error
        ? createPortal(
            <div className="ink-page-error" data-ink-page-error="" role="alert">
              {renderPageError ? (
                renderPageError({ error, page })
              ) : (
                <>
                  <p>Page {page + 1} could not be shown.</p>
                  <code className="ink-error-code">{error.code}</code>
                </>
              )}
            </div>,
            host
          )
        : null}
      {renderAnnotation
        ? targets.map((t) =>
            createPortal(
              <InkAnnotation annotation={t.annotation} element={t.el}>
                {renderAnnotation}
              </InkAnnotation>,
              t.el,
              t.annotation.id
            )
          )
        : null}
    </>
  )
}
