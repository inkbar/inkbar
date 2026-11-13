import { describe, expect, it } from 'vitest'

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
})
