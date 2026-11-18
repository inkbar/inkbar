import { expect, test } from 'vitest'

import { num, rgbOf } from './operators'

test('num keeps at most four decimals and never an exponent', () => {
  expect(num(1)).toBe('1')
  expect(num(0.123456)).toBe('0.1235')
  expect(num(-0)).toBe('0')
  expect(num(1e-7)).toBe('0')
  expect(num(-1e-7)).toBe('0')
  expect(num(1234567.5)).toBe('1234567.5')
  expect(num(2.5)).toBe('2.5')
  expect(num(100)).toBe('100')
  expect(num(-3.25)).toBe('-3.25')
  expect(num(NaN)).toBe('0')
  expect(num(Infinity)).toBe('0')
})

test('rgbOf reads #rrggbb as 0 to 1', () => {
  const [r, g, b] = rgbOf('#ff8000')
  expect(r).toBe(1)
  expect(g).toBeCloseTo(0.502, 3)
  expect(b).toBe(0)
})
