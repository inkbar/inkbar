import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { openDocument, writable, type InkDocument } from '@inkbar/core'
import { createPluginHost } from '@inkbar/core/dom'

import { makeLetter } from '../../vite/documents/letter.ts'
import { makeRedactions, redactionRecords } from '../../vite/documents/redactions.ts'

import {
  findSuggestions,
  suggestionsPlugin,
  type Suggestion,
  type SuggestionsOptions,
} from './suggestions.ts'

/** PDF.js's files from core's own copy, as file paths for Node. */
function nodeAssets() {
  const require = createRequire(fileURLToPath(import.meta.resolve('@inkbar/core')))
  const root = dirname(require.resolve('pdfjs-dist/package.json'))
  return {
    worker: require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    cMaps: join(root, 'cmaps') + '/',
    standardFonts: join(root, 'standard_fonts') + '/',
    wasm: join(root, 'wasm') + '/',
    icc: join(root, 'iccs') + '/',
  }
}

let redactionsBytes: Uint8Array
const opened: InkDocument[] = []

/** A fresh copy of `bytes`, open and ready. */
async function openBytes(bytes: Uint8Array): Promise<InkDocument> {
  const doc = await openDocument(bytes.slice(), { assets: nodeAssets() })
  opened.push(doc)
  await doc.ready
  return doc
}

/**
 * What the redactions document yields, in reading order. A kind's first hit takes the kind's
 * id and each later hit, of any value, takes the next number: the second email is `email-2`.
 */
const REDACTIONS_IDS = [
  'ni-number',
  'email',
  'phone',
  'email-2',
  'ni-number-2',
  'email-3',
  'phone-2',
  'phone-3',
  'email-4',
  'email-5',
  'phone-4',
]

/** A fresh copy of the redactions document, open and ready. */
const openRedactions = () => openBytes(redactionsBytes)

before(async () => {
  redactionsBytes = await makeRedactions()
})

after(() => {
  for (const doc of opened) doc.destroy()
})

/** The plugin in a real host, over the redactions document, as a viewer runs it. */
async function setUp(options?: SuggestionsOptions) {
  const doc = await openRedactions()
  const document = writable<InkDocument | null>(null)
  const host = createPluginHost({
    plugins: [suggestionsPlugin(options)],
    document,
    history: () => document.get()!.history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(null),
  })
  document.set(doc)
  return { doc, document, suggest: host.command('sandbox.suggest')! }
}

const statusOf = (s: Suggestion) => [s.id, s.status]

void test('findSuggestions lists the first record values in reading order', async () => {
  const doc = await openRedactions()
  const found = await findSuggestions(doc)
  const [record] = redactionRecords()
  assert.deepEqual(
    found.slice(0, 3).map((s) => [s.id, s.reason, s.status, s.page, s.text]),
    [
      ['ni-number', 'National Insurance number', 'suggested', 0, record!.ni[0]],
      ['email', 'Email address', 'suggested', 0, record!.emails[0]],
      ['phone', 'Phone number', 'suggested', 0, record!.phones[0]],
    ]
  )
  assert.deepEqual(
    found.map((s) => s.confidence),
    found.map(
      (s) =>
        ({ 'National Insurance number': 0.95, 'Email address': 0.85 })[s.reason] ?? 0.6
    )
  )
})

void test('findSuggestions marks where the text is on the page', async () => {
  const doc = await openRedactions()
  const [ni] = await findSuggestions(doc)
  assert.equal(ni!.text, 'QQ123456C')
  assert.ok(ni!.quads.length > 0)
  assert.ok(ni!.rect.width > 20 && ni!.rect.height > 6 && ni!.rect.height < 20)
  // Inside the page: x and y are in points from the bottom left.
  assert.ok(ni!.rect.x > 0 && ni!.rect.y > 0)
})

void test('findSuggestions numbers repeated kinds in reading order', async () => {
  const found = await findSuggestions(await openRedactions())
  assert.deepEqual(
    found.map((s) => s.id),
    REDACTIONS_IDS
  )
  assert.equal(found[3]!.text, found[1]!.text, 'email-2 repeats the first email')
})

void test('findSuggestions finds every NI number, email and phone in the redactions document', async () => {
  const doc = await openBytes(await makeRedactions())
  const found = await findSuggestions(doc)
  // Each value, as often as the records and their call notes hold it.
  const expected = new Map<string, number>()
  for (const r of redactionRecords())
    for (const value of [...r.ni, ...r.emails, ...r.phones])
      expected.set(value, 1 + r.note.split(value).length - 1 + (expected.get(value) ?? 0))
  const counts = new Map<string, number>()
  for (const s of found) counts.set(s.text, (counts.get(s.text) ?? 0) + 1)
  assert.deepEqual(new Map([...counts].sort()), new Map([...expected].sort()))
  assert.deepEqual(
    new Set(found.map((s) => s.reason)),
    new Set(['National Insurance number', 'Email address', 'Phone number'])
  )
  assert.equal(new Set(found.map((s) => s.id)).size, found.length, 'ids are unique')
  // Each value sits on one line, so its mark is one tight box.
  for (const s of found) assert.equal(s.quads.length, 1, `${s.id} wraps`)
})

void test('findSuggestions finds nothing when the text is absent', async () => {
  const doc = await openBytes(await makeLetter())
  assert.deepEqual(await findSuggestions(doc), [])
})

void test('findSuggestions stops when its signal aborts', async () => {
  const doc = await openRedactions()
  const controller = new AbortController()
  const found = findSuggestions(doc, { signal: controller.signal })
  controller.abort()
  await assert.rejects(found, { name: 'AbortError' })
})

void test('Suggest adds the suggestions once, in one undo step, and saves them', async () => {
  let saved: readonly Suggestion[] = []
  const { doc, suggest } = await setUp({
    records: { suggestions: { onChange: (list) => (saved = list) } },
  })
  assert.equal(suggest.label, 'Suggest redactions')
  await suggest.run()
  assert.equal(suggest.status?.get(), '11 suggestions')
  assert.deepEqual(
    saved.map((s) => s.id),
    REDACTIONS_IDS
  )
  await suggest.run()
  assert.equal(suggest.status?.get(), '0 suggestions')
  assert.equal(saved.length, 11)
  doc.history.undo()
  assert.equal(saved.length, 0)
})

void test('a Suggest run that a new document interrupts adds nothing to either', async () => {
  let saved: readonly Suggestion[] = []
  const { document, suggest } = await setUp({
    records: { suggestions: { onChange: (list) => (saved = list) } },
  })
  const run = suggest.run()
  document.set(await openRedactions())
  await run
  assert.equal(saved.length, 0)
  assert.equal(suggest.status?.get(), '')
})

void test('deleting an accepted redaction restores its suggestion, in the same undo step', async () => {
  let saved: readonly Suggestion[] = []
  const [first] = await findSuggestions(await openRedactions())
  const { doc } = await setUp({
    records: {
      suggestions: {
        // The host's saved state: one suggestion accepted, its redaction linked to it.
        initial: () => [{ ...first!, status: 'accepted' }],
        onChange: (list) => (saved = list),
      },
    },
  })
  const redaction = doc.annotations.add({
    type: 'redact',
    page: first!.page,
    quads: first!.quads,
    color: doc.annotations.defaults.color('redact'),
    custom: { sandbox: { suggestions: first!.id } },
  })
  doc.annotations.remove(redaction.id)
  assert.deepEqual(saved.map(statusOf), [[first!.id, 'suggested']])
  doc.history.undo()
  assert.deepEqual(saved.map(statusOf), [[first!.id, 'accepted']])
  assert.ok(doc.annotations.list.get().some((a) => a.id === redaction.id))
})
