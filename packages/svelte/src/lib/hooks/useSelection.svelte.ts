import { useInkContext } from '../context.js'

export function useSelection() {
  const ctx = useInkContext('useSelection()')
  const store = () => ctx.document?.annotations
  return {
    get selection() {
      return ctx.selection
    },
    select: (ids: string[]) => store()?.select(ids),
    clear: () => store()?.select([]),
  }
}
