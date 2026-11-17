import { describe, expect, test } from 'vitest'

import { clusters } from './clusters'

describe('clusters', () => {
  test('a base keeps its marks, and an emoji its selector and skin tone', () => {
    expect(clusters('éx')).toEqual(['é', 'x'])
    expect(clusters('❤️a')).toEqual(['❤️', 'a'])
    expect(clusters('👋🏽')).toEqual(['👋🏽'])
  })

  test('a joined sequence and a flag are one cluster each', () => {
    expect(clusters('👨‍👩‍👧')).toEqual(['👨‍👩‍👧'])
    expect(clusters('🇫🇷🇩🇪')).toEqual(['🇫🇷', '🇩🇪'])
  })

  test.each([
    ['a combining mark', '́'],
    ['a variation selector', '️'],
    ['a zero-width joiner', '‍'],
    ['a zero-width non-joiner', '‌'],
  ])(
    '%s after a space or a tab is a cluster beside it, not part of it',
    (_name, extra) => {
      expect(clusters(`a ${extra}b`)).toEqual(['a', ' ', extra, 'b'])
      expect(clusters(`a\t${extra}b`)).toEqual(['a', '\t', extra, 'b'])
      expect(clusters(` ${extra}${extra}`)).toEqual([' ', `${extra}${extra}`])
    }
  )

  test('a character after a joiner that follows whitespace is not glued to the joiner', () => {
    expect(clusters(' ‍b')).toEqual([' ', '‍', 'b'])
  })
})
