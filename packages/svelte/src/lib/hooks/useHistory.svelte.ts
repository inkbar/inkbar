import { useInkContext, type InkHistory } from '../context.js'

/**
 * Undo and redo. Uncontrolled documents use the core history; controlled hosts that pass
 * `history` to InkRoot get a snapshot stack over their own list, applied through the binding.
 */
export function useHistory(): InkHistory {
  return useInkContext('useHistory()').history
}
