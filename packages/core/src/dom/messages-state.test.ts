import { describe, expect, it } from 'vitest'

import { de } from '../locales/de'
import { fr } from '../locales/fr'
import { en } from '../messages'

import { createMessageState, type MessageState } from './messages-state'

describe('createMessageState', () => {
  it('starts as English with the input merged in', () => {
    const state = createMessageState({ find: { close: 'Fermer' } }, 'fr')
    expect(state.get().messages.find.close).toBe('Fermer')
    expect(state.get().messages.find.next).toBe(en.find.next)
    expect(state.get().locale).toBe('fr')
    expect(createMessageState().get().messages).toEqual(en)
  })

  it('setMessages emits a new state with the override', () => {
    const state = createMessageState()
    const seen: MessageState[] = []
    state.subscribe((s) => seen.push(s))
    state.setMessages({ find: { close: 'Fermer' } })
    expect(seen).toHaveLength(1)
    expect(seen[0]!.messages.find.close).toBe('Fermer')
  })

  it('setLocale emits a new messages object, so memos keyed on it read labels again', () => {
    const state = createMessageState({ find: { close: 'Fermer' } })
    const before = state.get().messages
    state.setLocale('fr')
    expect(state.get().messages).not.toBe(before)
    expect(state.get().messages).toEqual(before)
  })

  it('setMessages replaces what was passed before', () => {
    const state = createMessageState({ find: { close: 'Fermer' } })
    state.setMessages({ find: { next: 'Suivant' } })
    expect(state.get().messages.find.close).toBe(en.find.close)
    expect(state.get().messages.find.next).toBe('Suivant')
  })

  it('setLocale emits the locale and keeps the messages', () => {
    const state = createMessageState({ find: { close: 'Fermer' } })
    const seen: MessageState[] = []
    state.subscribe((s) => seen.push(s))
    state.setLocale('fr')
    expect(seen.map((s) => s.locale)).toEqual(['fr'])
    expect(seen[0]!.messages.find.close).toBe('Fermer')
  })

  it('setLocale emits a new messages object, so memos keyed on it read labels again', () => {
    const state = createMessageState({ find: { close: 'Fermer' } })
    const before = state.get().messages
    state.setLocale('fr')
    expect(state.get().messages).not.toBe(before)
    expect(state.get().messages).toEqual(before)
  })

  it('emits for every call, even with the same input', () => {
    const input = { find: { close: 'Fermer' } }
    const state = createMessageState(input)
    let calls = 0
    state.subscribe(() => calls++)
    state.setMessages(input)
    state.setMessages(input)
    state.setLocale(undefined)
    state.setLocale(undefined)
    expect(calls).toBe(4)
  })

  describe('messages carry their language', () => {
    it("uses the messages' lang without a locale", () => {
      expect(createMessageState(fr).get().locale).toBe('fr')
    })

    it('an explicit locale wins', () => {
      expect(createMessageState(fr, 'fr-CA').get().locale).toBe('fr-CA')
    })

    it('English by default sets no locale', () => {
      expect(createMessageState().get().locale).toBeUndefined()
      expect(createMessageState({ find: { close: 'X' } }).get().locale).toBeUndefined()
    })

    it("setMessages moves the locale to the new messages' lang", () => {
      const state = createMessageState(fr)
      state.setMessages(de)
      expect(state.get().locale).toBe('de')
      state.setMessages(undefined)
      expect(state.get().locale).toBeUndefined()
    })

    it("clearing the locale falls back to the messages' lang", () => {
      const state = createMessageState(fr, 'fr-CA')
      state.setMessages(de)
      expect(state.get().locale).toBe('fr-CA')
      state.setLocale(undefined)
      expect(state.get().locale).toBe('de')
    })
  })
})
