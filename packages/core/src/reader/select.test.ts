import { describe, expect, it } from 'vitest'

import { readerKind } from './select'

describe('readerKind', () => {
  it('is always the engine', () => {
    expect(readerKind()).toBe('engine')
  })
})
