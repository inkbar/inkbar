import { describe, expect, it } from 'vitest'

import { staticDefaults } from './defaults'
import { createAnnotationStore } from './store'
import { acceptSuggestion } from './suggestions'

import type { Annotation } from './types'

const rect = { x: 72, y: 600, width: 100, height: 20 }

describe('acceptSuggestion', () => {
  it('makes a suggestion the user’s own and resets its colour to the redaction default', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: {
        ...staticDefaults,
        color: (t) => (t === 'redact' ? '#112233' : '#000000'),
      },
    })
    const s = store.add({
      type: 'redact',
      page: 0,
      rect,
      origin: 'suggested',
      suggestion: { confidence: 0.2, reason: 'possible email' },
    })
    expect(s.color).toBe(staticDefaults.suggestion('low'))
    const after = acceptSuggestion(store, s.id)
    expect(after).toMatchObject({
      origin: 'user',
      color: '#112233',
      suggestion: { confidence: 0.2, reason: 'possible email' },
    })
    expect(store.get(s.id)).toEqual(after)
  })

  it('leaves anything that is not a suggested redaction alone', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const own = store.add({ type: 'redact', page: 0, rect, color: '#445566' })
    const note = store.add({ type: 'note', page: 0, rect })
    expect(acceptSuggestion(store, own.id)).toBeUndefined()
    expect(acceptSuggestion(store, note.id)).toBeUndefined()
    expect(acceptSuggestion(store, 'missing')).toBeUndefined()
    expect(store.get(own.id)!.color).toBe('#445566')
  })

  it('refuses a locked suggestion and changes nothing', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const s = store.add({
      type: 'redact',
      page: 0,
      rect,
      origin: 'suggested',
      suggestion: { confidence: 0.9 },
    })
    store.update(s.id, { locked: true })
    const before = store.get(s.id)
    expect(acceptSuggestion(store, s.id)).toBeUndefined()
    expect(store.get(s.id)).toBe(before)
  })

  it('accepts a suggestion a controlled host has not applied yet', () => {
    const proposals: Annotation[][] = []
    const store = createAnnotationStore({
      mode: { mode: 'controlled', initial: [], onChange: (next) => proposals.push(next) },
      defaults: staticDefaults,
    })
    const s = store.add({
      type: 'redact',
      page: 0,
      rect,
      origin: 'suggested',
      suggestion: { confidence: 0.2 },
    })
    expect(store.get(s.id)).toBeUndefined()
    const after = acceptSuggestion(store, s.id)
    expect(after).toMatchObject({ id: s.id, origin: 'user' })
    expect(proposals.at(-1)).toEqual([after])
    store.destroy()
  })
})
