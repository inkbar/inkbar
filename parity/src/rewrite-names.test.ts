import { describe, expect, it } from 'vitest'

import { rewriteNames } from './rewrite-names'

describe('the fixtures PARITY_BASELINE names', () => {
  const known = ['text-simple', 'links', 'outline']

  it('are none when it is unset, and every one for all', () => {
    expect(rewriteNames('', known)).toEqual([])
    expect(rewriteNames('all', known)).toEqual(['all'])
  })

  it('are the names listed, spaces and empty entries left out', () => {
    expect(rewriteNames('text-simple, links,', known)).toEqual(['text-simple', 'links'])
  })

  it('throws naming each name that is not a fixture the suite reads', () => {
    expect(() => rewriteNames('text-simple,text-simpel,outlnie', known)).toThrow(
      /text-simpel, outlnie/
    )
  })
})
