import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as icons from '@inkbar/icons'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  type PDFObject,
} from 'pdf-lib'

import { DOCUMENT_NAMES, makeDocument } from './index.ts'
import { Sheet, type Fonts } from './layout.ts'
import {
  LONG_HITS,
  LONG_HIT_PAGES,
  LONG_PAGES,
  SEARCH_WORD,
  longPageText,
} from './long-text.ts'
import { redactionRecords } from './redactions.ts'

const load = async (name: (typeof DOCUMENT_NAMES)[number]): Promise<PDFDocument> =>
  PDFDocument.load(await makeDocument(name))

/** Every annotation dictionary in the document, page by page. */
function annotations(d: PDFDocument): PDFDict[] {
  return d.getPages().flatMap((page) => {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    return (annots?.asArray() ?? []).map((ref) => d.context.lookup(ref, PDFDict))
  })
}

const name = (o: PDFObject | undefined): string => String(o ?? '').replace(/^\//, '')

/** How often `word` appears in `text`, ignoring case. */
const count = (text: string, word: string): number =>
  text.toLowerCase().split(word.toLowerCase()).length - 1

void test('every document builds and parses', async () => {
  assert.deepEqual(
    [...DOCUMENT_NAMES],
    ['tour', 'letter', 'form', 'redactions', 'long', 'handbook']
  )
  for (const doc of DOCUMENT_NAMES) {
    const d = await load(doc)
    assert.ok(d.getPageCount() > 0, `${doc} has no pages`)
  }
})

void test('the same bytes come back for the same build', async () => {
  for (const doc of DOCUMENT_NAMES)
    assert.deepEqual(await makeDocument(doc), await makeDocument(doc), doc)
})

void test('tour carries one of each annotation type', async () => {
  const d = await load('tour')
  assert.ok(d.getPageCount() <= 4)
  const subtypes = new Set(annotations(d).map((a) => name(a.get(PDFName.of('Subtype')))))
  for (const subtype of [
    'Highlight',
    'Underline',
    'StrikeOut',
    'Squiggly',
    'Square',
    'Circle',
    'Line',
    'Polygon',
    'Ink',
    'FreeText',
    'Text',
    'Stamp',
  ])
    assert.ok(subtypes.has(subtype), `no ${subtype}`)
})

void test('tour has a line with an arrow, a note with a reply and an appearance on the stamp', async () => {
  const all = annotations(await load('tour'))
  const of = (subtype: string) =>
    all.filter((a) => name(a.get(PDFName.of('Subtype'))) === subtype)
  const line = of('Line')[0]!
  const ends = line.lookup(PDFName.of('LE'), PDFArray).asArray().map(name)
  assert.ok(
    ends.some((e) => e.endsWith('Arrow')),
    `line ends ${ends.join(', ')}`
  )
  const notes = of('Text')
  const reply = notes.find((n) => n.has(PDFName.of('IRT')))
  assert.ok(reply, 'no reply')
  assert.ok(
    notes.some((n) => n !== reply && !n.has(PDFName.of('IRT'))),
    'no root note'
  )
  const stamp = of('Stamp')[0]!
  assert.ok(
    stamp.lookup(PDFName.of('AP'), PDFDict).has(PDFName.of('N')),
    'stamp has no /AP'
  )
})

void test('letter has no annotations', async () => {
  const d = await load('letter')
  assert.ok(d.getPageCount() >= 1 && d.getPageCount() <= 2)
  assert.equal(annotations(d).length, 0)
  assert.equal(d.getForm().getFields().length, 0)
})

void test('form has the choice list and a submit action', async () => {
  const d = await load('form')
  const fields = d.getForm().getFields()
  assert.ok(
    fields.some((f) => f instanceof PDFDropdown),
    'no choice list'
  )
  const submits = fields
    .flatMap((f) => f.acroField.getWidgets())
    .map((w) => w.dict.lookupMaybe(PDFName.of('A'), PDFDict))
    .filter((a) => a && name(a.get(PDFName.of('S'))) === 'SubmitForm')
  assert.ok(submits.length > 0, 'no submit-form action')
})

void test('redactions holds the fictional data', async () => {
  const d = await load('redactions')
  assert.ok(d.getPageCount() >= 1)
  const records = redactionRecords()
  const names = records.map((r) => r.name)
  const emails = records.flatMap((r) => r.emails)
  const phones = records.flatMap((r) => r.phones)
  const ni = records.flatMap((r) => r.ni)
  const addresses = records.flatMap((r) => r.address ?? [])
  assert.ok(new Set(names).size >= 3, 'fewer than 3 names')
  assert.ok(new Set(emails).size >= 3, 'fewer than 3 emails')
  assert.ok(new Set(phones).size >= 2, 'fewer than 2 phone numbers')
  assert.ok(new Set(ni).size >= 2, 'fewer than 2 NI numbers')
  assert.ok(addresses.length >= 2, 'fewer than 2 addresses')
  for (const e of emails) assert.match(e, /@example\.com$/)
  for (const p of phones) assert.match(p, /^07700 900\d{3}$/)
  for (const n of ni) assert.match(n, /^QQ\d{6}[A-D]$/)
})

void test('long has 200 pages and the known hits', async () => {
  assert.equal(SEARCH_WORD, 'invoice')
  const d = await load('long')
  assert.equal(d.getPageCount(), LONG_PAGES)
  assert.equal(LONG_PAGES, 200)
  const hits = Array.from({ length: LONG_PAGES }, (_, i) =>
    count(longPageText(i + 1).join('\n'), SEARCH_WORD)
  )
  const total = hits.reduce((a, b) => a + b, 0)
  const pages = hits.flatMap((n, i) => (n > 0 ? [i + 1] : []))
  assert.equal(total, LONG_HITS)
  assert.equal(LONG_HITS, 48)
  assert.equal(pages.length, LONG_HIT_PAGES)
  assert.equal(LONG_HIT_PAGES, 31)
  assert.ok(
    pages.some((p) => p >= 190),
    `last hit on page ${pages.at(-1)}`
  )
  // Each line is drawn as its own run, so a hit never runs across two.
  for (let p = 1; p <= LONG_PAGES; p++)
    for (const line of longPageText(p)) assert.ok(line.length <= 96, line)
})

void test('long builds quickly', async () => {
  const start = performance.now()
  const bytes = await makeDocument('long')
  const ms = performance.now() - start
  assert.ok(ms < 2000, `took ${Math.round(ms)} ms`)
  assert.ok(bytes.length < 1.5 * 1024 * 1024, `${bytes.length} bytes`)
})

void test('every toolbar icon draws in a guide as readable path operators', async () => {
  const d = await PDFDocument.create()
  const drawn = Object.entries(icons).filter(([, icon]) => Array.isArray(icon))
  for (const [, icon] of drawn)
    new Sheet(d.addPage(), {} as Fonts).icon(icon as icons.IconNode, 0, 0, 12)
  const saved = await PDFDocument.load(await d.save())
  saved.getPages().forEach((page, i) => {
    const streams = page.node.lookup(PDFName.of('Contents'), PDFArray).asArray()
    const ops = streams
      .map((ref) => {
        const stream = saved.context.lookup(ref)
        assert.ok(stream instanceof PDFRawStream)
        return new TextDecoder().decode(decodePDFRawStream(stream).decode())
      })
      .join('\n')
    // pdf-lib writes NaN for path data it cannot read, such as arc flags run together.
    assert.doesNotMatch(ops, /NaN/, drawn[i]![0])
    assert.match(ops, /^S$/m, drawn[i]![0])
  })
})
