import { manifest, FIXTURE_NAMES } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import parityJson from '../parity.json' with { type: 'json' }

import { PAGES_PER_FIXTURE } from './pages'
import { parityProblems } from './verdicts'

const compared = Object.fromEntries(
  FIXTURE_NAMES.filter((name) => manifest[name].opens).map((name) => [
    name,
    Math.min(manifest[name].pages, PAGES_PER_FIXTURE),
  ])
)

describe('parity.json', () => {
  it('holds one well-formed verdict for every fixture that opens, and nothing else', () => {
    expect(parityProblems(parityJson, compared)).toEqual([])
  })
})

describe('parityProblems', () => {
  const two = { a: 2 }
  it.each([
    [{ a: { state: 'odd' } }, 'a: unknown state "odd"'],
    [{ a: { state: 'same', note: 'x' } }, 'a: unknown key note'],
    [{ a: { state: 'different', accepted: false } }, 'a: no reason'],
    [
      { a: { state: 'different', reason: ' ', accepted: false } },
      'a: reason is empty or not a string',
    ],
    [
      { a: { state: 'different', reason: 'r', accepted: 'no' } },
      'a: accepted is not a boolean',
    ],
    [{ a: { state: 'baseline' } }, 'a: no reason'],
    [{ a: { state: 'same', blank: false } }, 'a: blank is not true'],
    [
      { a: { state: 'different', reason: 'r', accepted: false, pages: [3] } },
      'a: pages must list compared pages, 1 to 2, in increasing order',
    ],
    [
      { a: { state: 'different', reason: 'r', accepted: false, pages: [2, 1] } },
      'a: pages must list compared pages, 1 to 2, in increasing order',
    ],
    [{ a: { state: 'same' }, b: { state: 'same' } }, 'b: not a fixture that opens'],
    [{}, 'a: no verdict recorded'],
  ])('finds %j wrong', (json, problem) => {
    expect(parityProblems(json, two)).toContain(problem)
  })

  it('accepts each well-formed shape', () => {
    for (const entry of [
      { state: 'same' },
      { state: 'same', blank: true },
      { state: 'different', reason: 'r', accepted: false },
      { state: 'different', reason: 'r', accepted: true, pages: [2] },
      { state: 'baseline', reason: 'r' },
      { state: 'skipped', reason: 'r' },
    ]) {
      expect(parityProblems({ a: entry }, two)).toEqual([])
    }
  })
})
