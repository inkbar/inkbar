import { acceptSuggestion, repliesTo } from '@inkbar/core'
import { useMemo } from 'react'

import { useInkContext } from '../context'

import type { Annotation, AnnotationInput } from '@inkbar/core'

export function useAnnotations() {
  const ctx = useInkContext('useAnnotations()')
  const { annotations, selection, document } = ctx
  const store = () => document?.annotations
  const selected = useMemo(
    () =>
      selection
        .map((id) => annotations.find((a) => a.id === id))
        .filter((a): a is Annotation => !!a),
    [annotations, selection]
  )
  return {
    annotations,
    selection,
    selected,
    byPage: (page: number) => annotations.filter((a) => a.page === page),
    add: (input: AnnotationInput) => store()?.add(input),
    update: (id: string, patch: Partial<Annotation>) => store()?.update(id, patch),
    remove: (id: string) => store()?.remove(id) ?? false,
    select: (ids: string[]) => store()?.select(ids),
    /** Replies in creation order for a note id. */
    replies: (id: string) => repliesTo(annotations, id),
    /** Keeps a suggested redaction as the user's own, in the default redaction colour. */
    accept: (id: string) => {
      const s = store()
      return s ? acceptSuggestion(s, id) : undefined
    },
    dismiss: (id: string) => store()?.remove(id) ?? false,
  }
}
