import { useInkContext } from '../context'

import type { InkHistory } from '../context'

/**
 * Undo and redo. Uncontrolled documents use the core history; controlled hosts that pass
 * `history` to InkRoot get a snapshot stack over their own list, applied through v-model.
 */
export function useHistory(): InkHistory {
  return useInkContext('useHistory()').history
}
