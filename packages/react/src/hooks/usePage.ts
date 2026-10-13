import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

export function usePage() {
  const ctx = useInkContext('usePage()')
  const current = useReadable<number>(ctx.viewport?.currentPage, 0)
  return {
    /** 0-based. */
    current,
    count: ctx.document?.pages.length ?? 0,
    goTo: (index: number) => ctx.viewport?.scrollToPage(index),
    next: () => ctx.viewport?.scrollToPage(current + 1),
    previous: () => ctx.viewport?.scrollToPage(current - 1),
    scrollToAnnotation(id: string) {
      const a = ctx.document?.annotations.get(id)
      if (a) ctx.viewport?.scrollToRect(a.page, a.rect)
    },
  }
}
