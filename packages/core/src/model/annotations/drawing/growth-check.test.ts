import { describe, expect, test } from 'vitest'

import { expectLinearGrowth } from './growth-check'

/** A clock that only work moves, and the work that moves it by `cost(n, call)` ms. */
function fakeWork(cost: (n: number, call: number) => number) {
  let time = 0
  let call = 0
  return { now: () => time, operation: (n: number) => void (time += cost(n, call++)) }
}

describe('expectLinearGrowth', () => {
  test('passes linear work', () => {
    const { now, operation } = fakeWork((n) => n / 1000)
    expect(expectLinearGrowth(operation, 1000, { now })).toBeCloseTo(4)
  })

  test('fails quadratic work', () => {
    const { now, operation } = fakeWork((n) => (n / 1000) ** 2)
    expect(() => expectLinearGrowth(operation, 1000, { now })).toThrow(/16\.0 times/)
  })

  test('passes linear work when the machine stalls for a stretch of the timings', () => {
    // Calls 4 to 13 each take three times as long, as when another process takes the processor.
    const { now, operation } = fakeWork(
      (n, call) => (n / 1000) * (call >= 4 && call < 14 ? 3 : 1)
    )
    expect(expectLinearGrowth(operation, 1000, { now })).toBeLessThan(9)
  })

  test('passes linear work when only the larger timings are slowed at first', () => {
    // The first five timings at 4n are slow and those at n are not: the old order of measuring.
    let large = 0
    const { now, operation } = fakeWork(
      (n) => (n / 1000) * (n === 4000 && large++ < 5 ? 3 : 1)
    )
    expect(expectLinearGrowth(operation, 1000, { now })).toBeLessThan(9)
  })
})
