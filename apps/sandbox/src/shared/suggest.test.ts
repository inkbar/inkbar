import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  rectOfQuads,
  suggestRedactions,
  suggestionCount,
  type SuggestSource,
} from './suggest.ts'
import { confidenceColor, suggestionOf } from './suggestion.ts'

import type { Annotation, AnnotationInput } from '@inkbar/core'

/** The suggestion an input carries, read the way the sandbox reads a stored annotation. */
const suggestionIn = (f: AnnotationInput) => suggestionOf(f as Annotation)

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
    found.map((f) => suggestionIn(f)?.reason),
    ['National Insurance number', 'Email address', 'Phone number']
  )
  for (const f of found) {
    assert.equal(f.type, 'redact')
    assert.equal(f.page, 0)
    assert.equal(suggestionIn(f)?.status, 'suggested')
    assert.equal(f.color, confidenceColor(suggestionIn(f)!.confidence))
    assert.equal('origin' in f, false)
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

void test('places the redaction by measured width, not character count', async () => {
  // "iiii " is 5 narrow characters (1 unit each) before "QQ123456C" (9 wide, 4 units each):
  // 41 units across 300pt. Counting characters would start the box at 5/14 of the run.
  const doc = docWith('iiii QQ123456C')
  const measure = (text: string): number =>
    [...text].reduce((sum, ch) => sum + (ch === 'i' || ch === ' ' ? 1 : 4), 0)
  const [first] = await suggestRedactions(doc, [], 0, measure)
  assert.ok(first && first.type === 'redact' && first.quads)
  const rect = rectOfQuads(first.quads)
  assert.equal(rect.x.toFixed(2), ((5 / 41) * 300).toFixed(2))
  assert.equal(rect.width.toFixed(2), ((36 / 41) * 300).toFixed(2))
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

void test('finds exactly the four sensitive strings in the sample, and no serial, times or amounts', async () => {
  const lines = [
    'Invoice 2041',
    'Due 14 November 2026',
    '£1,746.00',
    'Jan 44',
    'SN 0047-2219-B',
    'MFD 06/2026',
    '08:15',
    'Exp 08:41',
    'Ref C-30918',
    'Margaret Okafor',
    'QQ123456C',
    'm.okafor@example.com',
    '07700 900123',
    'agreed; confirmation sent to m.okafor@example.com.',
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
  assert.equal((await suggestRedactions(doc, [], 0)).length, 4)
})
