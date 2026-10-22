import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createAnnotationStore,
  createHistory,
  createRecordStore,
  staticDefaults,
  writable,
  type InkDocument,
  type RecordBase,
  type RecordStore,
} from '@inkbar/core'

import {
  acceptSuggestion,
  dismissSuggestion,
  SAMPLE_SUGGESTIONS,
  suggestionsPlugin,
  type Suggestion,
} from './suggestions.ts'

import type { CommandSpec, PluginContext } from '@inkbar/core/dom'

/** The text of the sample's page 4, as one run per value: enough for Suggest to find them. */
const SAMPLE_TEXT = [
  'QQ123456C',
  'm.okafor@example.com',
  '07700 900123',
  'agreed; confirmation sent to m.okafor@example.com.',
]

/**
 * A four-page document whose last page holds `text`, with a real annotation store and
 * history, and a plugin context over it that records what the plugin registers.
 */
function setUp(text: string[] = SAMPLE_TEXT) {
  const annotations = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
  })
  const history = createHistory(annotations)
  const doc = {
    pages: [0, 1, 2, 3].map((index) => ({ index })),
    text: (page: number) =>
      Promise.resolve({ items: (page === 3 ? text : []).map((str) => ({ str })) }),
    annotations,
    history,
  } as unknown as InkDocument
  const commands = new Map<string, CommandSpec>()
  let store: RecordStore<Suggestion> | null = null
  const ctx: PluginContext = {
    id: 'sandbox',
    document: writable<InkDocument | null>(doc),
    history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(null),
    commands: {
      add(spec) {
        commands.set(spec.id, spec)
        return {} as never
      },
    },
    tools: { add() {} },
    decorate() {},
    redecorate() {},
    store<T extends RecordBase>(name: string) {
      assert.equal(name, 'suggestions')
      const s = createRecordStore<T>(`sandbox.${name}`)
      history.track(s)
      store = s as unknown as RecordStore<Suggestion>
      return writable(s)
    },
    onDocument(fn) {
      fn(doc)
    },
    onAnnotationEdit(fn) {
      history.react(fn)
    },
    layer: () => ({ invalidate() {} }),
  }
  suggestionsPlugin().setup(ctx)
  const suggest = commands.get('suggest')!
  return { ctx, doc, annotations, history, store: store!, suggest }
}

/** Adds the sample's four suggestions straight to the store, as Suggest would. */
function withSample() {
  const env = setUp()
  env.history.batch(() => {
    for (const s of SAMPLE_SUGGESTIONS) env.store.add(s)
  })
  return env
}

void test('suggest adds the four sample suggestions once', async () => {
  const { store, suggest } = setUp()
  assert.equal(suggest.label, 'Suggest redactions')
  await suggest.run()
  assert.deepEqual(
    store.list.get().map((s) => [s.reason, s.confidence, s.status, s.page]),
    // In reading order: the record's three values, then the email in the call note.
    [
      ['National Insurance number', 0.95, 'suggested', 3],
      ['Email address', 0.85, 'suggested', 3],
      ['Phone number', 0.6, 'suggested', 3],
      ['Email address', 0.85, 'suggested', 3],
    ]
  )
  assert.equal(suggest.status?.get(), '4 suggestions')
  await suggest.run()
  assert.equal(store.list.get().length, 4)
  assert.equal(suggest.status?.get(), '0 suggestions')
})

void test('suggest finds nothing when the text is absent', async () => {
  const { store, suggest } = setUp(['Nothing to see here.'])
  await suggest.run()
  assert.equal(store.list.get().length, 0)
  assert.equal(suggest.status?.get(), '0 suggestions')
})

void test('accept marks the suggestion and adds a linked redaction in one undo step', () => {
  const { ctx, store, annotations, history } = withSample()
  const [first] = SAMPLE_SUGGESTIONS
  acceptSuggestion(ctx, store, first!.id)
  assert.equal(store.get(first!.id)?.status, 'accepted')
  const [redaction] = annotations.list.get()
  assert.equal(redaction?.type, 'redact')
  assert.equal(redaction?.page, 3)
  assert.deepEqual(redaction?.custom, { sandbox: { suggestionId: first!.id } })
  assert.equal(redaction?.color, annotations.defaults.color('redact'))
  assert.equal(redaction?.type === 'redact' && redaction.quads?.length, 1)

  history.undo()
  assert.equal(store.get(first!.id)?.status, 'suggested')
  assert.equal(annotations.list.get().length, 0)
})

void test('dismiss marks it dismissed', () => {
  const { store } = withSample()
  const [, second] = SAMPLE_SUGGESTIONS
  dismissSuggestion(store, second!.id)
  assert.equal(store.get(second!.id)?.status, 'dismissed')
  assert.equal(store.list.get().length, 4)
})

void test('removing an accepted redaction restores its suggestion', () => {
  const { ctx, store, annotations, history } = withSample()
  const [first] = SAMPLE_SUGGESTIONS
  acceptSuggestion(ctx, store, first!.id)
  const [redaction] = annotations.list.get()
  annotations.remove(redaction!.id)
  assert.equal(store.get(first!.id)?.status, 'suggested')
  // The restore is part of the removal's undo step.
  history.undo()
  assert.equal(store.get(first!.id)?.status, 'accepted')
  assert.equal(annotations.list.get().length, 1)
})
