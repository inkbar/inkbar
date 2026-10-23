import { describe, expect, it } from 'vitest'

import { findAnnouncer, findCountText } from './find-text'

import type { SearchState } from './controller'
import type { SearchHit } from '../../model/search'

function hit(page: number, start: number): SearchHit {
  return {
    page,
    start,
    end: start + 3,
    text: 'foo',
    quads: [],
    rect: { x: 0, y: 0, width: 1, height: 1 },
    exact: true,
    before: '',
    after: '',
  }
}

const state = (changes: Partial<SearchState>): SearchState => ({
  open: true,
  query: 'foo',
  matchCase: false,
  hits: [],
  current: -1,
  scanning: false,
  ...changes,
})

describe('findCountText', () => {
  it('counts, marks a running scan and reports no results', () => {
    const hits = [hit(0, 1), hit(1, 1), hit(2, 1)]
    expect(findCountText(state({ hits, current: 1 }))).toBe('2 of 3')
    expect(findCountText(state({ hits, current: 1, scanning: true }))).toBe('2 of 3…')
    expect(findCountText(state({}))).toBe('No results')
    expect(findCountText(state({ scanning: true }))).toBe('')
  })

  it('is blank for an empty or whitespace-only query', () => {
    expect(findCountText(state({ query: '' }))).toBe('')
    expect(findCountText(state({ query: '   ' }))).toBe('')
    expect(findCountText(state({ query: ' \t' }))).toBe('')
  })
})

describe('findAnnouncer', () => {
  it('announces a settled scan', () => {
    const announce = findAnnouncer()
    const hits = Array.from({ length: 17 }, (_, i) => hit(i < 3 ? 0 : 1, i))
    expect(announce(state({ hits, current: 2 }))).toBe('Match 3 of 17, page 1')
    expect(announce(state({ hits, current: 3 }))).toBe('Match 4 of 17, page 2')
    expect(announce(state({}))).toBe('No results')
  })

  it('says nothing while closed or for a blank query', () => {
    const announce = findAnnouncer()
    expect(announce(state({ open: false }))).toBe('')
    expect(announce(state({ query: '' }))).toBe('')
    expect(announce(state({ query: '  ' }))).toBe('')
  })

  it('announces a step during a scan, but not the hits that arrive around it', () => {
    const announce = findAnnouncer()
    const a = [hit(1, 1), hit(1, 5), hit(1, 9)]
    // The first hits arrive and become current: nothing to say yet.
    expect(announce(state({ scanning: true, hits: a, current: 0 }))).toBe('')
    // A step moves current to another hit.
    const say = announce(state({ scanning: true, hits: a, current: 2 }))
    expect(say).toBe('Match 3 of 3 so far, page 2')
    // More hits land, some before current: the announcement stays put.
    const b = [hit(0, 1), hit(0, 2), ...a, hit(2, 1)]
    expect(announce(state({ scanning: true, hits: b, current: 4 }))).toBe(say)
    // Settled: the final count.
    expect(announce(state({ hits: b, current: 4 }))).toBe('Match 5 of 6, page 2')
  })

  it('starts over for a new scan', () => {
    const announce = findAnnouncer()
    const a = [hit(0, 1), hit(0, 5)]
    announce(state({ scanning: true, hits: a, current: 0 }))
    expect(announce(state({ scanning: true, hits: a, current: 1 }))).toBe(
      'Match 2 of 2 so far, page 1'
    )
    expect(announce(state({ scanning: true, hits: [], current: -1 }))).toBe('')
    const b = [hit(3, 1)]
    expect(announce(state({ scanning: true, hits: b, current: 0 }))).toBe('')
  })
})
