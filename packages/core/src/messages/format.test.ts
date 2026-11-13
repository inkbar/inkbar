import { describe, expect, it } from 'vitest'

import { plural, template } from './format'

describe('template', () => {
  it('formats numbers the way the language does', () => {
    expect(template('en', 'Page {page} of {total}')({ page: 3, total: 1200 })).toBe(
      'Page 3 of 1,200'
    )
    expect(template('de', '{n}')({ n: 1200 })).toBe('1.200')
  })

  it('leaves the braces when a param is missing', () => {
    expect(template('en', 'a {x}')({})).toBe('a {x}')
  })

  it('rejects an invalid lang when the message is defined', () => {
    expect(() => template('xx-!!', 'a {x}')).toThrow(RangeError)
  })

  it('keeps its source readable', () => {
    expect(
      (template('en', 'a {x}') as unknown as { source: { text: string } }).source.text
    ).toBe('a {x}')
  })
})

describe('plural', () => {
  it('picks the English forms', () => {
    const f = plural<{ count: number }>('en', 'count', {
      one: '{count} item',
      other: '{count} items',
    })
    expect(f({ count: 1 })).toBe('1 item')
    expect(f({ count: 0 })).toBe('0 items')
    expect(f({ count: 2 })).toBe('2 items')
  })

  it('rejects an invalid lang when the message is defined', () => {
    expect(() => plural('xx-!!', 'count', { other: '{count}' })).toThrow(RangeError)
  })

  it('follows the language: French treats 0 as one', () => {
    const f = plural<{ count: number }>('fr', 'count', {
      one: '{count} résultat',
      other: '{count} résultats',
    })
    expect(f({ count: 0 })).toBe('0 résultat')
  })

  it('keeps its source readable', () => {
    const forms = { one: '{count} a', other: '{count} b' }
    const source = (plural('en', 'count', forms) as unknown as { source: unknown }).source
    expect(source).toEqual({ param: 'count', forms })
  })
})
