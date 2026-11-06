import { describe, expect, it, vi } from 'vitest'

import { handleResultsFieldKey } from './find-key'

/** A keydown as the handler reads it. */
const key = (init: Partial<KeyboardEvent>) =>
  ({
    key: 'Enter',
    isComposing: false,
    defaultPrevented: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...init,
  }) as unknown as KeyboardEvent

describe('handleResultsFieldKey', () => {
  it('steps to the next match on Enter and the previous on Shift+Enter', () => {
    const search = { next: vi.fn(), previous: vi.fn() }
    const preventDefault = vi.fn()
    expect(handleResultsFieldKey(key({ preventDefault }), search)).toBe(true)
    expect(search.next).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalled()
    expect(handleResultsFieldKey(key({ shiftKey: true }), search)).toBe(true)
    expect(search.previous).toHaveBeenCalledTimes(1)
  })

  it('leaves other keys, composition and modified Enter alone', () => {
    const search = { next: vi.fn(), previous: vi.fn() }
    for (const e of [
      key({ key: 'a' }),
      key({ isComposing: true }),
      key({ ctrlKey: true }),
      key({ defaultPrevented: true }),
    ])
      expect(handleResultsFieldKey(e, search)).toBe(false)
    expect(search.next).not.toHaveBeenCalled()
    expect(search.previous).not.toHaveBeenCalled()
  })
})
