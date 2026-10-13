import { useInkContext } from '../context'

import type { AnnotationDocument, ImportOptions } from '@inkbar/core'

export function useDocument() {
  const ctx = useInkContext('useDocument()')
  const { document, status } = ctx
  return {
    document,
    status,
    isReady: status.state === 'ready',
    error: status.state === 'error' ? status.error : null,
    pages: document?.pages ?? [],
    info: document?.info ?? null,
    exportAnnotations: () => document?.exportAnnotations('json'),
    importAnnotations: (data: AnnotationDocument | string, opts?: ImportOptions) =>
      document?.importAnnotations(data, opts),
  }
}
