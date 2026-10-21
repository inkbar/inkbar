import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createAnnotationStore, exportAnnotations, staticDefaults } from '@inkbar/core'

import {
  acceptSuggestion,
  confidenceColor,
  decorateSuggestion,
  suggestionOf,
} from './suggestion.ts'

import type { Annotation, AnnotationInput } from '@inkbar/core'

const rect = { x: 10, y: 10, width: 80, height: 12 }

function suggested(extra: Record<string, unknown> = {}): AnnotationInput {
  return {
    type: 'redact',
    page: 0,
    rect,
    color: confidenceColor(0.95),
    custom: {
      ...extra,
      sandbox: {
        suggestion: {
          confidence: 0.95,
          reason: 'National Insurance number',
          explanation: 'Matched QQ123456C',
          status: 'suggested',
        },
      },
    },
  }
}

function storeWith(...inputs: AnnotationInput[]) {
  const store = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
  })
  const added = inputs.map((input) => store.add(input))
  return { store, added }
}

void test('suggestionOf reads custom.sandbox.suggestion from a redaction', () => {
  const { added } = storeWith(suggested())
  assert.deepEqual(suggestionOf(added[0]!), {
    confidence: 0.95,
    reason: 'National Insurance number',
    explanation: 'Matched QQ123456C',
    status: 'suggested',
  })
})

void test('suggestionOf ignores other types, a missing key and a malformed shape', () => {
  const { added } = storeWith(
    { type: 'square', page: 0, rect, custom: suggested().custom },
    { type: 'redact', page: 0, rect },
    {
      type: 'redact',
      page: 0,
      rect,
      custom: { sandbox: { suggestion: { confidence: 'high', reason: 'x' } } },
    }
  )
  for (const a of added) assert.equal(suggestionOf(a), undefined)
})

void test('confidenceColor', () => {
  assert.equal(confidenceColor(0.3), '#D4A017')
  assert.equal(confidenceColor(0.6), '#E67E22')
  assert.equal(confidenceColor(0.95), '#C0392B')
})

void test('decorateSuggestion tags a suggestion with its status', () => {
  const { store, added } = storeWith(suggested(), { type: 'redact', page: 0, rect })
  assert.deepEqual(decorateSuggestion(added[0]!), {
    data: { 'sandbox-suggestion': 'suggested' },
    description: 'Suggested redaction',
  })
  assert.equal(decorateSuggestion(added[1]!), undefined)
  // An accepted suggestion is a plain redaction to a screen reader.
  assert.deepEqual(decorateSuggestion(acceptSuggestion(store, added[0]!.id)!), {
    data: { 'sandbox-suggestion': 'accepted' },
  })
})

void test('acceptSuggestion marks it accepted in the default redaction colour', () => {
  const { store, added } = storeWith(suggested({ case: 7 }))
  const id = added[0]!.id
  const accepted = acceptSuggestion(store, id)
  assert.ok(accepted)
  assert.equal(accepted.color, staticDefaults.color('redact'))
  assert.equal(suggestionOf(accepted)?.status, 'accepted')
  assert.equal(suggestionOf(accepted)?.reason, 'National Insurance number')
  assert.equal(accepted.custom?.case, 7)
  assert.equal(acceptSuggestion(store, id), undefined)
})

void test('acceptSuggestion leaves a locked suggestion alone', () => {
  const { store: scratch } = storeWith()
  const locked = { ...scratch.completeInput(suggested()), locked: true } as Annotation
  const store = createAnnotationStore({
    mode: { mode: 'uncontrolled', initial: [locked] },
    defaults: staticDefaults,
  })
  assert.equal(acceptSuggestion(store, locked.id), undefined)
  assert.equal(suggestionOf(store.get(locked.id)!)?.status, 'suggested')
})

void test('an export keeps the suggestion data', () => {
  const { store } = storeWith(suggested())
  const [exported] = exportAnnotations(store).annotations
  const custom = exported?.custom as { sandbox?: { suggestion?: unknown } } | undefined
  assert.deepEqual(custom?.sandbox?.suggestion, suggestionOf(store.list.get()[0]!))
})
