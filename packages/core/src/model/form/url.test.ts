import { describe, expect, it } from 'vitest'

import { safeAddress, safeUrl } from './url'

describe('safeUrl', () => {
  it('keeps http, https, mailto and tel', () => {
    for (const url of [
      'http://a.test/',
      'https://a.test/x',
      'mailto:a@b.test',
      'tel:+441',
    ])
      expect(safeUrl(url)).toBe(url)
  })

  it('drops other schemes and relative URLs', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///etc',
      '/x',
      '',
    ])
      expect(safeUrl(url)).toBeUndefined()
  })
})

describe('safeAddress', () => {
  it('keeps plain addresses and mailto, drops other schemes', () => {
    expect(safeAddress('forms@example.com')).toBe('forms@example.com')
    expect(safeAddress('mailto:forms@example.com')).toBe('mailto:forms@example.com')
    expect(safeAddress('javascript:alert(1)')).toBeUndefined()
  })
})
