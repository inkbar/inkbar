import { useInkContext } from '../context.js'

import type { AnnotationDocument, ImportOptions, PageInfo } from '@inkbar/core'

const NO_PAGES: readonly PageInfo[] = []

export function useDocument() {
  const ctx = useInkContext('useDocument()')
  return {
    get document() {
      return ctx.document
    },
    get status() {
      return ctx.status
    },
    get isReady() {
      return ctx.status.state === 'ready'
    },
    get error() {
      const s = ctx.status
      return s.state === 'error' ? s.error : null
    },
    get pages() {
      return ctx.document?.pages ?? NO_PAGES
    },
    get info() {
      return ctx.document?.info ?? null
    },
    exportAnnotations: () => ctx.document?.exportAnnotations('json'),
    importAnnotations: (data: AnnotationDocument | string, opts?: ImportOptions) =>
      ctx.document?.importAnnotations(data, opts),
  }
}
