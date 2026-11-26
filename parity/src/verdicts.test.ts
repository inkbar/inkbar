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

const pageCounts = Object.fromEntries(
  FIXTURE_NAMES.filter((name) => manifest[name].opens).map((name) => [
    name,
    manifest[name].pages,
  ])
)

describe('parity.json', () => {
  it('holds one well-formed verdict for every fixture that opens, and nothing else', () => {
    expect(parityProblems(parityJson, compared, pageCounts)).toEqual([])
  })
})

describe('parityProblems', () => {
  const two = { a: 2 }
  it.each([
    [{ a: { state: 'odd' } }, 'a: unknown state "odd"'],
    [{ a: { state: 'toString' } }, 'a: unknown state "toString"'],
    [
      { a: { state: 'same', links: { state: 'constructor' } } },
      'a: links: unknown state "constructor"',
    ],
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
    [{ a: { state: 'same', text: { state: 'odd' } } }, 'a: text: unknown state "odd"'],
    [{ a: { state: 'same', links: 'same' } }, 'a: links: not an object'],
    [
      { a: { state: 'same', links: { state: 'different', accepted: false } } },
      'a: links: no reason',
    ],
    [
      { a: { state: 'same', text: { state: 'different', reason: '', accepted: false } } },
      'a: text: reason is empty or not a string',
    ],
    [
      { a: { state: 'same', outline: { state: 'different', reason: 'r', accepted: 1 } } },
      'a: outline: accepted is not a boolean',
    ],
    [
      { a: { state: 'same', text: { state: 'same', reason: 'r' } } },
      'a: text: unknown key reason',
    ],
    [
      {
        a: {
          state: 'same',
          outline: { state: 'different', reason: 'r', accepted: false, pages: [1] },
        },
      },
      'a: outline: unknown key pages',
    ],
    [
      {
        a: {
          state: 'same',
          text: { state: 'different', reason: 'r', accepted: false, pages: [3] },
        },
      },
      'a: text: pages must list compared pages, 1 to 2, in increasing order',
    ],
    [
      { a: { state: 'skipped', reason: 'r', text: { state: 'same' } } },
      'a: unknown key text',
    ],
    [
      { a: { state: 'skipped', reason: 'r', links: { state: 'same' } } },
      'a: unknown key links',
    ],
    [
      { a: { state: 'skipped', reason: 'r', outline: { state: 'same' } } },
      'a: unknown key outline',
    ],
  ])('finds %j wrong', (json, problem) => {
    expect(parityProblems(json, two)).toContain(problem)
  })

  it.each(['facts', 'form', 'scripts'])('takes no pages on a %s verdict', (part) => {
    expect(
      parityProblems(
        {
          a: {
            state: 'same',
            [part]: { state: 'different', reason: 'r', accepted: false, pages: [1] },
          },
        },
        two
      )
    ).toEqual([`a: ${part}: unknown key pages`])
  })

  it.each(['facts', 'form', 'annotations', 'scripts', 'formLayer'])(
    'checks a %s verdict as the others are checked',
    (part) => {
      expect(
        parityProblems({ a: { state: 'same', [part]: { state: 'odd' } } }, two)
      ).toEqual([`a: ${part}: unknown state "odd"`])
      expect(
        parityProblems(
          {
            a: {
              state: 'same',
              [part]: { state: 'different', reason: '', accepted: false },
            },
          },
          two
        )
      ).toEqual([`a: ${part}: reason is empty or not a string`])
      expect(
        parityProblems(
          { a: { state: 'skipped', reason: 'r', [part]: { state: 'same' } } },
          two
        )
      ).toEqual([`a: unknown key ${part}`])
    }
  )

  it('lets an annotations verdict list any page of the file, and the form layer only the compared ones', () => {
    const entry = (part: string) => ({
      a: {
        state: 'same',
        [part]: { state: 'different', reason: 'r', accepted: false, pages: [5] },
      },
    })
    expect(parityProblems(entry('annotations'), two, { a: 6 })).toEqual([])
    expect(parityProblems(entry('formLayer'), two, { a: 6 })).toEqual([
      'a: formLayer: pages must list compared pages, 1 to 2, in increasing order',
    ])
  })

  it('lets a links verdict list any page of the file, and text only the compared ones', () => {
    const entry = (part: string) => ({
      a: {
        state: 'same',
        [part]: { state: 'different', reason: 'r', accepted: false, pages: [5] },
      },
    })
    expect(parityProblems(entry('links'), two, { a: 6 })).toEqual([])
    expect(parityProblems(entry('text'), two, { a: 6 })).toEqual([
      'a: text: pages must list compared pages, 1 to 2, in increasing order',
    ])
    expect(parityProblems(entry('links'), two, { a: 4 })).toEqual([
      'a: links: pages must list compared pages, 1 to 4, in increasing order',
    ])
  })

  it('accepts each well-formed shape', () => {
    for (const entry of [
      { state: 'same' },
      { state: 'same', blank: true },
      { state: 'different', reason: 'r', accepted: false },
      { state: 'different', reason: 'r', accepted: true, pages: [2] },
      { state: 'baseline', reason: 'r' },
      { state: 'skipped', reason: 'r' },
      {
        state: 'same',
        text: { state: 'different', reason: 'r', accepted: false, pages: [1, 2] },
        links: { state: 'same' },
        outline: { state: 'different', reason: 'r', accepted: false },
      },
      {
        state: 'different',
        reason: 'r',
        accepted: false,
        text: { state: 'same' },
        links: { state: 'different', reason: 'r', accepted: true },
      },
      { state: 'baseline', reason: 'r', text: { state: 'same' } },
    ]) {
      expect(parityProblems({ a: entry }, two)).toEqual([])
    }
  })
})
