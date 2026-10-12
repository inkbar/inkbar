import { describe, expect, it } from 'vitest'

import { InkError, isInkError } from './errors'

describe('InkError', () => {
  it('carries a code, details and cause', () => {
    const cause = new Error('boom')
    const e = new InkError(
      'AssetLoadFailed',
      'Could not load worker',
      { url: 'http://x/w.mjs' },
      cause
    )
    expect(e.code).toBe('AssetLoadFailed')
    expect(e.message).toBe('Could not load worker')
    expect(e.details).toEqual({ url: 'http://x/w.mjs' })
    expect(e.cause).toBe(cause)
    expect(e.name).toBe('InkError')
    expect(isInkError(e)).toBe(true)
    expect(isInkError(cause)).toBe(false)
  })
})
