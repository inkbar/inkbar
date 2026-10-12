import { useInkContext } from '../context'

export function useSelection() {
  const ctx = useInkContext('useSelection()')
  return {
    selection: ctx.selection,
    select: (ids: string[]) => ctx.document.value?.annotations.select(ids),
    clear: () => ctx.document.value?.annotations.select([]),
  }
}
