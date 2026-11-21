import { expect } from 'vitest'

/** The fewest and the most rounds of timings `expectLinearGrowth` takes. */
const MIN_ROUNDS = 5
const MAX_ROUNDS = 25

/**
 * How the cost of `operation` grows: the best timing at 4n over the best at n, after a warm-up.
 * Linear work gives about 4 and quadratic about 16, so a ratio under 9 tells them apart.
 *
 * Each round times n and then 4n, so a stall on the machine slows both alike. When the ratio is
 * still too high after the first rounds, more rounds follow: a stall that slowed only the larger
 * timings passes, and the ratio of work that grows faster stays high in every round. The ceiling
 * only guards against a hang. `now` is the clock, in ms.
 */
export function expectLinearGrowth(
  operation: (n: number) => void,
  n: number,
  { maxRatio = 9, ceilingMs = 20_000, now = () => performance.now() } = {}
): number {
  const timed = (size: number): number => {
    const start = now()
    operation(size)
    return now() - start
  }
  operation(n)
  let small = Infinity
  let large = Infinity
  let ratio = Infinity
  for (let round = 0; round < MAX_ROUNDS; round++) {
    small = Math.min(small, timed(n))
    large = Math.min(large, timed(4 * n))
    ratio = large / Math.max(small, 0.01)
    if (round + 1 >= MIN_ROUNDS && ratio < maxRatio) break
  }
  expect(large, 'a ceiling against a hang').toBeLessThan(ceilingMs)
  expect(ratio, `4n took ${ratio.toFixed(1)} times as long as n`).toBeLessThan(maxRatio)
  return ratio
}
