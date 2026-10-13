/*
 * Slot props for one annotation. It renders only its children: the overlay already draws the
 * default visual for every annotation that is not custom, so this never draws a second one.
 * InkPage portals it into the annotation's overlay element.
 */
import { acceptSuggestion } from '@inkbar/core'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { useInkContext } from '../context'

import type { Annotation } from '@inkbar/core'
import type { AnnotationSlotProps, AnnotationState } from '@inkbar/core/dom'

export interface InkAnnotationProps {
  annotation: Annotation
  /** The overlay element; its `data-state` (which includes hover) drives `state`. */
  element?: HTMLElement | undefined
  children: (props: AnnotationSlotProps) => ReactNode
}

function readState(el: HTMLElement): AnnotationState | null {
  const s = el.dataset.state
  return s === 'idle' || s === 'hover' || s === 'selected' ? s : null
}

export function InkAnnotation({ annotation, element, children }: InkAnnotationProps) {
  const ctx = useInkContext('InkAnnotation')
  const [observed, setObserved] = useState<AnnotationState | null>(() =>
    element ? readState(element) : null
  )
  useEffect(() => {
    if (!element) {
      setObserved(null)
      return
    }
    setObserved(readState(element))
    const observer = new MutationObserver(() => setObserved(readState(element)))
    observer.observe(element, { attributes: true, attributeFilter: ['data-state'] })
    return () => observer.disconnect()
  }, [element])

  const { id } = annotation
  const isSuggestion = annotation.type === 'redact' && annotation.origin === 'suggested'
  const locked = annotation.locked === true
  const selected = ctx.selection.includes(id)
  const store = ctx.document?.annotations
  const slotProps = useMemo<AnnotationSlotProps>(
    () => ({
      annotation,
      state: observed ?? (selected ? 'selected' : 'idle'),
      locked,
      select: () => store?.select([id]),
      remove: () => void store?.remove(id),
      accept: () => {
        if (store && isSuggestion) acceptSuggestion(store, id)
      },
      dismiss: () => {
        if (isSuggestion) store?.remove(id)
      },
    }),
    [annotation, observed, selected, locked, store, id, isSuggestion]
  )
  return <>{children(slotProps)}</>
}
