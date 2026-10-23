/*
 * The find bar's copy, shared by the vanilla bar and the framework bindings so it cannot drift.
 */
import type { SearchState } from './controller'

/**
 * The count beside the field: "3 of 17", "3 of 12…" while scanning, "No results".
 *
 * @internal Shared with the framework bindings.
 */
export function findCountText(s: SearchState): string {
  if (s.query === '') return ''
  if (s.hits.length === 0) return s.scanning ? '' : 'No results'
  return `${s.current + 1} of ${s.hits.length}${s.scanning ? '…' : ''}`
}

/**
 * The announcement for a settled scan, or '' while there is nothing to say.
 *
 * @internal Shared with the framework bindings.
 */
export function findAnnouncement(s: SearchState): string {
  if (!s.open || s.scanning || s.query === '') return ''
  const hit = s.hits[s.current]
  if (!hit) return 'No results'
  return `Match ${s.current + 1} of ${s.hits.length}, page ${hit.page + 1}`
}
