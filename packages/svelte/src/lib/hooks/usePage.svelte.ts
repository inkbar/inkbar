import { useInkContext } from '../context.js'
import { useReadable } from '../use-readable.svelte.js'

export function usePage() {
  const ctx = useInkContext('usePage()')
  const current = useReadable<number>(() => ctx.viewport?.currentPage, 0)
  return {
    /** 0-based. */
    get current() {
      return current.current
    },
    get count() {
      return ctx.document?.pages.length ?? 0
    },
    goTo: (index: number) => ctx.viewport?.scrollToPage(index),
    next: () => {
      const vp = ctx.viewport
      vp?.scrollToPage(vp.currentPage.get() + 1)
    },
    previous: () => {
      const vp = ctx.viewport
      vp?.scrollToPage(vp.currentPage.get() - 1)
    },
    scrollToAnnotation(id: string) {
      const a = ctx.document?.annotations.get(id)
      if (a) ctx.viewport?.scrollToRect(a.page, a.rect)
    },
  }
}
