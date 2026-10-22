import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { openDocument, writable, type InkDocument } from '@inkbar/core'
import { createPluginHost } from '@inkbar/core/dom'

import { makeSample } from '../../vite/make-sample.ts'

import {
  findSuggestions,
  SAMPLE_SUGGESTIONS,
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

/** A fresh copy of the sandbox's sample PDF, open and ready. */
async function openSample(): Promise<InkDocument> {
  const doc = await openDocument(sampleBytes.slice(), { assets: nodeAssets() })
  opened.push(doc)
  await doc.ready
  return doc
}

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
    found.map((s) => [s.reason, s.confidence, s.status, s.page]),
    [
      ['National Insurance number', 0.95, 'suggested', 3],
      ['Email address', 0.85, 'suggested', 3],
      ['Phone number', 0.6, 'suggested', 3],
      ['Email address', 0.85, 'suggested', 3],
    ]
  )
})

void test('findSuggestions finds nothing when the text is absent', async () => {
  const doc = {
    pages: [0, 1, 2, 3].map((index) => ({ index })),
    pageText: () => Promise.resolve('Nothing to see here.'),
  } as unknown as InkDocument
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
    SAMPLE_SUGGESTIONS.map((s) => s.id)
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
  const [first] = SAMPLE_SUGGESTIONS
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
