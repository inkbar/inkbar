import { useMemo } from 'react'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

export function usePage() {
  const ctx = useInkContext('usePage()')
  const { viewport, document } = ctx
  const current = useReadable<number>(viewport?.currentPage, 0)
  return useMemo(
    () => ({
      /** 0-based. */
      current,
      count: document?.pages.length ?? 0,
      goTo: (index: number) => viewport?.scrollToPage(index),
      // Read the live page, so these stay the same functions as the reader scrolls.
      next: () => viewport?.scrollToPage(viewport.currentPage.get() + 1),
      previous: () => viewport?.scrollToPage(viewport.currentPage.get() - 1),
      scrollToAnnotation(id: string) {
        const a = document?.annotations.get(id)
        if (a) viewport?.scrollToRect(a.page, a.rect)
      },
    }),
    [viewport, document, current]
  )
}
