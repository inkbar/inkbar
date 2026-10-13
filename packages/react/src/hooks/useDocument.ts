import { useInkContext } from '../context'

import type { AnnotationDocument, ImportOptions, PageInfo } from '@inkbar/core'

const NO_PAGES: readonly PageInfo[] = []

export function useDocument() {
  const ctx = useInkContext('useDocument()')
  const { document, status } = ctx
  return {
    document,
    status,
    isReady: status.state === 'ready',
    error: status.state === 'error' ? status.error : null,
    pages: document?.pages ?? NO_PAGES,
    info: document?.info ?? null,
    exportAnnotations: () => document?.exportAnnotations('json'),
    importAnnotations: (data: AnnotationDocument | string, opts?: ImportOptions) =>
      document?.importAnnotations(data, opts),
  }
}
