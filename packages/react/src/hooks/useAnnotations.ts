import { acceptSuggestion, repliesTo } from '@inkbar/core'
import { useMemo } from 'react'

import { useInkContext } from '../context'

import type { Annotation, AnnotationInput } from '@inkbar/core'

export function useAnnotations() {
  const ctx = useInkContext('useAnnotations()')
  const { annotations, selection, document } = ctx
  const store = document?.annotations
  const selected = useMemo(
    () =>
      selection
        .map((id) => annotations.find((a) => a.id === id))
        .filter((a): a is Annotation => !!a),
    [annotations, selection]
  )
  // Stable for the life of the document, so hosts can pass them as props or effect deps.
  const actions = useMemo(
    () => ({
      add: (input: AnnotationInput) => store?.add(input),
      update: (id: string, patch: Partial<Annotation>) => store?.update(id, patch),
      remove: (id: string) => store?.remove(id) ?? false,
      select: (ids: string[]) => store?.select(ids),
      /** Keeps a suggested redaction as the user's own, in the default redaction colour. */
      accept: (id: string) => (store ? acceptSuggestion(store, id) : undefined),
      dismiss: (id: string) => store?.remove(id) ?? false,
    }),
    [store]
  )
  return useMemo(
    () => ({
      annotations,
      selection,
      selected,
      byPage: (page: number) => annotations.filter((a) => a.page === page),
      /** Replies in creation order for a note id. */
      replies: (id: string) => repliesTo(annotations, id),
      ...actions,
    }),
    [annotations, selection, selected, actions]
  )
}
