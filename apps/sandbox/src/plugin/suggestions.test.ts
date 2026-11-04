import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { openDocument, writable, type InkDocument } from '@inkbar/core'
import { createPluginHost } from '@inkbar/core/dom'

import { makeLetter } from '../../vite/documents/letter.ts'
import { makeRedactions, redactionRecords } from '../../vite/documents/redactions.ts'
import { makeSample } from '../../vite/make-sample.ts'

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

let sampleBytes: Uint8Array
const opened: InkDocument[] = []

/** A fresh copy of `bytes`, open and ready. */
async function openBytes(bytes: Uint8Array): Promise<InkDocument> {
  const doc = await openDocument(bytes.slice(), { assets: nodeAssets() })
  opened.push(doc)
  await doc.ready
  return doc
}

/** A fresh copy of the sandbox's sample PDF, open and ready. */
const openSample = () => openBytes(sampleBytes)

/** The sample's customer record on page 4, in reading order. */
const SAMPLE_IDS = ['ni-number', 'email', 'phone', 'email-2']

before(async () => {
  sampleBytes = await makeSample()
})

after(() => {
  for (const doc of opened) doc.destroy()
})

/** The plugin in a real host, over the sample, as a viewer runs it. */
async function setUp(options?: SuggestionsOptions) {
  const doc = await openSample()
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

void test('findSuggestions finds the four sample values in the sample, in reading order', async () => {
  const doc = await openSample()
  const found = await findSuggestions(doc)
  assert.deepEqual(
    found.map((s) => [s.id, s.reason, s.confidence, s.status, s.page, s.text]),
    [
      ['ni-number', 'National Insurance number', 0.95, 'suggested', 3, 'QQ123456C'],
      ['email', 'Email address', 0.85, 'suggested', 3, 'm.okafor@example.com'],
      ['phone', 'Phone number', 0.6, 'suggested', 3, '07700 900123'],
      ['email-2', 'Email address', 0.85, 'suggested', 3, 'm.okafor@example.com'],
    ]
  )
})

void test('findSuggestions marks where the text is on the page', async () => {
  const doc = await openSample()
  const [ni] = await findSuggestions(doc)
  // The sample draws the NI number at x 383, on a line from about 247 to 259 pt.
  assert.ok(Math.abs(ni!.rect.x - 383) < 1, `x is ${ni!.rect.x}`)
  assert.ok(ni!.rect.y > 244 && ni!.rect.y + ni!.rect.height < 262, `y is ${ni!.rect.y}`)
  assert.ok(ni!.quads.length > 0)
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
  const doc = await openSample()
  const controller = new AbortController()
  const found = findSuggestions(doc, { signal: controller.signal })
  controller.abort()
  await assert.rejects(found, { name: 'AbortError' })
})

void test('Suggest adds the four suggestions once, in one undo step, and saves them', async () => {
  let saved: readonly Suggestion[] = []
  const { doc, suggest } = await setUp({
    records: { suggestions: { onChange: (list) => (saved = list) } },
  })
  assert.equal(suggest.label, 'Suggest redactions')
  await suggest.run()
  assert.equal(suggest.status?.get(), '4 suggestions')
  assert.deepEqual(
    saved.map((s) => s.id),
    SAMPLE_IDS
  )
  await suggest.run()
  assert.equal(suggest.status?.get(), '0 suggestions')
  assert.equal(saved.length, 4)
  doc.history.undo()
  assert.equal(saved.length, 0)
})

void test('a Suggest run that a new document interrupts adds nothing to either', async () => {
  let saved: readonly Suggestion[] = []
  const { document, suggest } = await setUp({
    records: { suggestions: { onChange: (list) => (saved = list) } },
  })
  const run = suggest.run()
  document.set(await openSample())
  await run
  assert.equal(saved.length, 0)
  assert.equal(suggest.status?.get(), '')
})

void test('deleting an accepted redaction restores its suggestion, in the same undo step', async () => {
  let saved: readonly Suggestion[] = []
  const [first] = await findSuggestions(await openSample())
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
