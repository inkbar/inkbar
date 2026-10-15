import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  rectOfQuads,
  suggestRedactions,
  suggestionCount,
  type SuggestSource,
} from './suggest.ts'

import type { Annotation } from '@inkbar/core'

/** One page with one 300pt-wide text run whose characters are all the same width. */
function docWith(str: string): SuggestSource {
  const quad = {
    p1: { x: 0, y: 20 },
    p2: { x: 300, y: 20 },
    p3: { x: 0, y: 8 },
    p4: { x: 300, y: 8 },
  }
  return {
    pages: [{ index: 0 }],
    text: () => Promise.resolve({ items: [{ str, quad }] }),
  } as unknown as SuggestSource
}

void test('finds National Insurance numbers, emails and phone numbers', async () => {
  const doc = docWith('NI QQ123456C, sam@example.com, 020 7946 0991')
  const found = await suggestRedactions(doc, [], 0)
  assert.deepEqual(
    found.map((f) => (f.type === 'redact' ? f.suggestion?.reason : '')),
    ['National Insurance number', 'Email address', 'Phone number']
  )
  for (const f of found) {
    assert.equal(f.type, 'redact')
    assert.equal(f.origin, 'suggested')
    assert.equal(f.page, 0)
  }
})

void test('places the redaction over the matched characters only', async () => {
  // 30 characters across 300pt: 10pt each. "QQ123456C" starts at index 3.
  const doc = docWith('NI QQ123456C and nothing else.')
  const [first] = await suggestRedactions(doc, [], 0)
  assert.ok(first && first.type === 'redact' && first.quads)
  const rect = rectOfQuads(first.quads)
  assert.equal(Math.round(rect.x), 30)
  assert.equal(Math.round(rect.width), 90)
})

void test('a second run over the same document suggests nothing new', async () => {
  const doc = docWith('NI QQ123456C, sam@example.com')
  const first = await suggestRedactions(doc, [], 0)
  const existing = first.map((f) => ({
    ...f,
    id: crypto.randomUUID(),
    rect:
      f.type === 'redact' && f.quads
        ? rectOfQuads(f.quads)
        : { x: 0, y: 0, width: 0, height: 0 },
  })) as unknown as Annotation[]
  assert.deepEqual(await suggestRedactions(doc, existing, 0), [])
})

void test('does not flag dates, case references or postcodes', async () => {
  const doc = docWith('Case FH-2026-0418, 9 March 1988, Leeds LS6 1AB, within 28 days')
  assert.deepEqual(await suggestRedactions(doc, [], 0), [])
})

void test('suggestionCount', () => {
  assert.equal(suggestionCount(0), '0 suggestions')
  assert.equal(suggestionCount(1), '1 suggestion')
  assert.equal(suggestionCount(9), '9 suggestions')
})

void test('finds exactly the nine sensitive strings in the sample, and no postcodes or case reference', async () => {
  const lines = [
    'Fernhill Housing Trust',
    '14 Orchard Row, Leeds LS2 7QQ',
    'casework@fernhill.example  |  0113 496 0000',
    '14 October 2026',
    'Ms Alex Rowan',
    'Flat 3, 22 Weaver Street, Leeds LS6 1AB',
    'Re: Review of your tenancy, case FH-2026-0418',
    'We hold your National Insurance number as QQ123456C. Please tell us if it is wrong.',
    'If anything here is unclear, call your case officer, Jordan Pike, on 07700 900123,',
    'or email jordan.pike@fernhill.example.',
    'Date of birth: 9 March 1988',
    'National Insurance number: QQ654321A',
    'Email: alex.rowan@example.com',
    'Phone: 020 7946 0991',
    'Partner: Sam Rowan, National Insurance number QQ246813B',
    'Agreed: the Trust will confirm the outcome of the review in writing within 28 days.',
  ]
  const quad = {
    p1: { x: 0, y: 20 },
    p2: { x: 300, y: 20 },
    p3: { x: 0, y: 8 },
    p4: { x: 300, y: 8 },
  }
  const doc = {
    pages: lines.map((_, index) => ({ index })),
    text: (index: number) => Promise.resolve({ items: [{ str: lines[index], quad }] }),
  } as unknown as SuggestSource
  assert.equal((await suggestRedactions(doc, [], 0)).length, 9)
})
