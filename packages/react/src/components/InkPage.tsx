/*
 * One mounted page: canvas, text layer and annotation overlay from core's `createPageMount`,
 * in the host element the viewport created. Renders nothing in place; portals go into the host
 * (page error) and into each annotation's overlay element (custom annotations).
 *
 * The overlay creates and removes those elements as the annotation list changes, outside
 * React. So the portal targets come from a list read after every overlay render: this
 * component subscribes to the store after the overlay does, and core notifies subscribers in
 * order, so the elements already exist when the list arrives here.
 *
 * A page whose canvas or text layer fails gets `data-state="error"` on its host and the page
 * error portalled into it; the other pages carry on. It clears once every layer that failed
 * has since succeeded (a zoom change re-renders), or on the next mount of the page.
 */
import { InkError, isInkError } from '@inkbar/core'
import { createPageMount } from '@inkbar/core/dom'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useInkContext } from '../context'
import { useLatest } from '../use-latest'

import { InkAnnotation } from './InkAnnotation'

import type { Annotation } from '@inkbar/core'
import type {
  AnnotationSlotProps,
  PageLayer,
  PageMount,
  PageTransform,
} from '@inkbar/core/dom'

export interface InkPageProps {
  page: number
  host: HTMLElement
  transform: PageTransform
  /** Fixed for the life of the mount: InkViewport remounts the page when it changes. */
  customAnnotations?: boolean
  renderAnnotation?: ((props: AnnotationSlotProps) => ReactNode) | undefined
  renderPageError?: ((props: { error: InkError; page: number }) => ReactNode) | undefined
}

interface Target {
  annotation: Annotation
  el: HTMLElement
}

export function InkPage({
  page,
  host,
  transform,
  customAnnotations = false,
  renderAnnotation,
  renderPageError,
}: InkPageProps) {
  const ctx = useInkContext('InkPage')
  const mountRef = useRef<PageMount | null>(null)
  const applied = useRef<PageTransform | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [pageError, setPageError] = useState<InkError | null>(null)
  const latest = useLatest({
    document: ctx.document,
    setActivated: (id: string | null) => ctx.setActivated(id),
    page,
    transform,
  })

  useEffect(() => {
    const doc = latest.current.document
    if (!doc) return
    const custom = customAnnotations
    /** Layers that have failed and not yet recovered; the error clears when this empties. */
    const failedLayers = new Set<PageLayer>()
    let error: InkError | null = null
    const onError = (cause: unknown, layer: PageLayer): void => {
      failedLayers.add(layer)
      // The first failure wins: a canvas and a text layer failing together report one error.
      if (error) return
      error = isInkError(cause)
        ? cause
        : new InkError(
            'InvalidPdf',
            cause instanceof Error ? cause.message : String(cause),
            { page: latest.current.page },
            cause
          )
      host.setAttribute('data-state', 'error')
      setPageError(error)
    }
    const onRendered = (layer: PageLayer): void => {
      failedLayers.delete(layer)
      if (!error || failedLayers.size > 0) return
      error = null
      host.removeAttribute('data-state')
      setPageError(null)
    }
    const mount = createPageMount({
      document: doc,
      page: latest.current.page,
      host,
      transform: latest.current.transform,
      store: doc.annotations,
      onActivate: (id) => latest.current.setActivated(id),
      isCustom: () => custom,
      onError,
      onRendered,
    })
    mountRef.current = mount
    applied.current = latest.current.transform
    let stopList: (() => void) | undefined
    if (custom) {
      const read = (): void => {
        setTargets(
          doc.annotations.byPage(latest.current.page).flatMap((annotation) => {
            const el = mount.overlay.elementFor(annotation.id)
            return el ? [{ annotation, el }] : []
          })
        )
      }
      stopList = doc.annotations.list.subscribe(read)
      read()
    }
    return () => {
      stopList?.()
      setTargets([])
      mount.destroy()
      mountRef.current = null
      applied.current = null
      if (error) host.removeAttribute('data-state')
      setPageError(null)
    }
    // The mount lives as long as the host: the viewport hands a page a new host on every rebuild.
    // The initial transform is read from `latest`; later ones go through the effect below.
  }, [host, customAnnotations, latest])

  useEffect(() => {
    const mount = mountRef.current
    if (mount && applied.current !== transform) {
      applied.current = transform
      mount.update(transform)
    }
  }, [transform])

  return (
    <>
      {pageError
        ? createPortal(
            <div className="ink-page-error" data-ink-page-error="" role="alert">
              {renderPageError ? (
                renderPageError({ error: pageError, page })
              ) : (
                <>
                  <p>Page {page + 1} could not be shown.</p>
                  <code className="ink-error-code">{pageError.code}</code>
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
