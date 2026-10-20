import { acceptSuggestion, repliesTo } from '@inkbar/core'
import { computed } from 'vue'

import { useInkContext } from '../context'

import type { Annotation, AnnotationInput, AnnotationPatch } from '@inkbar/core'

export function useAnnotations() {
  const ctx = useInkContext('useAnnotations()')
  const store = () => ctx.document.value?.annotations
  return {
    annotations: ctx.annotations,
    selection: ctx.selection,
    selected: computed(() =>
      ctx.selection.value
        .map((id) => ctx.annotations.value.find((a) => a.id === id))
        .filter((a): a is Annotation => !!a)
    ),
    byPage: (page: number) => ctx.annotations.value.filter((a) => a.page === page),
    add: (input: AnnotationInput) => store()?.add(input),
    update: (id: string, patch: AnnotationPatch) => store()?.update(id, patch),
    remove: (id: string) => store()?.remove(id) ?? false,
    select: (ids: string[]) => store()?.select(ids),
    /** Replies in creation order for a note id. */
    replies: (id: string) => repliesTo(ctx.annotations.value, id),
    /** Keeps a suggested redaction as the user's own, in the default redaction colour. */
    accept: (id: string) => {
      const s = store()
      return s ? acceptSuggestion(s, id) : undefined
    },
    dismiss: (id: string) => store()?.remove(id) ?? false,
  }
}
