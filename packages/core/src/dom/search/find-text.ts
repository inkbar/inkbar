/*
 * The find bar's copy, shared by the vanilla bar and the framework bindings so it cannot drift.
 */
import { isBlankQuery } from '../../model/search-text'

import type { SearchState } from './controller'
import type { SearchHit } from '../../model/search'

/**
 * The count beside the field: "3 of 17", "3 of 12…" while scanning, "No results".
 *
 * @internal Shared with the framework bindings.
 */
export function findCountText(s: SearchState): string {
  if (isBlankQuery(s.query)) return ''
  if (s.hits.length === 0) return s.scanning ? '' : 'No results'
  return `${s.current + 1} of ${s.hits.length}${s.scanning ? '…' : ''}`
}

/**
 * Returns the function a bar calls with each search state for its live region's text.
 *
 * A settled scan reads "Match 3 of 17, page 2" or "No results". While a scan runs it says
 * nothing until a step moves the current hit, then "Match 3 of 12 so far, page 2", and keeps
 * that text as more hits arrive, so the region speaks once per step and once on settle rather
 * than once per hit.
 *
 * @internal Shared with the framework bindings; each bar keeps its own.
 */
export function findAnnouncer(): (s: SearchState) => string {
  let shown: SearchHit | undefined
  let said = ''
  return (s) => {
    const hit = s.hits[s.current]
    if (!s.open || isBlankQuery(s.query)) {
      shown = undefined
      said = ''
    } else if (!s.scanning) {
      shown = hit
      said = hit
        ? `Match ${s.current + 1} of ${s.hits.length}, page ${hit.page + 1}`
        : 'No results'
    } else {
      if (!hit) said = ''
      else if (shown && hit !== shown)
        said = `Match ${s.current + 1} of ${s.hits.length} so far, page ${hit.page + 1}`
      shown = hit
    }
    return said
  }
}
