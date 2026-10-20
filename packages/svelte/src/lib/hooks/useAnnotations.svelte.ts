import { acceptSuggestion, repliesTo } from '@inkbar/core'

import { useInkContext } from '../context.js'

import type { Annotation, AnnotationInput, AnnotationPatch } from '@inkbar/core'

export function useAnnotations() {
  const ctx = useInkContext('useAnnotations()')
  const selected = $derived(
    ctx.selection
      .map((id) => ctx.annotations.find((a) => a.id === id))
      .filter((a): a is Annotation => !!a)
  )
  const store = () => ctx.document?.annotations
  return {
    get annotations() {
      return ctx.annotations
    },
    get selection() {
      return ctx.selection
    },
    get selected() {
      return selected
    },
    byPage: (page: number) => ctx.annotations.filter((a) => a.page === page),
    /** Replies in creation order for a note id. */
    replies: (id: string) => repliesTo(ctx.annotations, id),
    add: (input: AnnotationInput) => store()?.add(input),
    update: (id: string, patch: AnnotationPatch) => store()?.update(id, patch),
    remove: (id: string) => store()?.remove(id) ?? false,
    select: (ids: string[]) => store()?.select(ids),
    /** Keeps a suggested redaction as the user's own, in the default redaction colour. */
    accept: (id: string) => {
      const s = store()
      return s ? acceptSuggestion(s, id) : undefined
    },
    dismiss: (id: string) => store()?.remove(id) ?? false,
  }
}
