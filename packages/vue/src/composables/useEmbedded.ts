import { computed } from 'vue'

import { useInkContext } from '../context'

export function useEmbedded() {
  const ctx = useInkContext('useEmbedded()')
  const summary = computed(() => ctx.document.value?.embedded ?? [])
  return {
    summary,
    total: computed(() => summary.value.reduce((n, s) => n + s.count, 0)),
    hasAny: computed(() => summary.value.length > 0),
  }
}
