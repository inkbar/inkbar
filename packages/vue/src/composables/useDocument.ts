import { computed } from 'vue'

import { useInkContext } from '../context'

import type { AnnotationDocument, ImportOptions } from '@inkbar/core'

export function useDocument() {
  const ctx = useInkContext('useDocument()')
  return {
    document: ctx.document,
    status: ctx.status,
    isReady: computed(() => ctx.status.value.state === 'ready'),
    error: computed(() =>
      ctx.status.value.state === 'error' ? ctx.status.value.error : null
    ),
    pages: computed(() => ctx.document.value?.pages ?? []),
    info: computed(() => ctx.document.value?.info ?? null),
    exportAnnotations: () => ctx.document.value?.exportAnnotations('json'),
    importAnnotations: (data: AnnotationDocument | string, opts?: ImportOptions) =>
      ctx.document.value?.importAnnotations(data, opts),
  }
}
