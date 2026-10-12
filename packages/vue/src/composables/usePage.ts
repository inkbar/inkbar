import { computed } from 'vue'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

export function usePage() {
  const ctx = useInkContext('usePage()')
  const current = useReadable<number>(() => ctx.viewport.value?.currentPage ?? null, 0)
  return {
    /** 0-based. */
    current,
    count: computed(() => ctx.document.value?.pages.length ?? 0),
    goTo: (index: number) => ctx.viewport.value?.scrollToPage(index),
    next: () => ctx.viewport.value?.scrollToPage(current.value + 1),
    previous: () => ctx.viewport.value?.scrollToPage(current.value - 1),
    scrollToAnnotation(id: string) {
      const a = ctx.document.value?.annotations.get(id)
      if (a) ctx.viewport.value?.scrollToRect(a.page, a.rect)
    },
  }
}
